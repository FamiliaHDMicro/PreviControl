// index.js — PrevControl Worker
// Dois caminhos de entrada: formulário tradicional (/api/triagem) e Jarvis conversacional (/api/jarvis)
// Ambos alimentam a mesma tabela `leads`, vista no painel admin (/api/admin/leads).

import { getAllBenefits, getBenefitConfig, runTriagem, CLASSIFICATION_LABELS } from "./rules.js";
import { chatWithJarvis, gerarLinkWhatsApp } from "./jarvis.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // ---- Formulário tradicional ----
    if (path === "/api/benefits" && request.method === "GET") {
      return json({ benefits: getAllBenefits() }, corsHeaders);
    }

    if (path === "/api/triagem" && request.method === "POST") {
      return handleTriagem(request, env, corsHeaders);
    }

    // ---- Jarvis conversacional ----
    if (path === "/api/jarvis" && request.method === "POST") {
      return handleJarvis(request, env, corsHeaders);
    }

    // ---- Painel admin (protegido por token) ----
    if (path === "/api/admin/leads" && request.method === "GET") {
      return handleAdminAuth(request, env, async () => {
        const filter = url.searchParams.get("classification");
        const status = url.searchParams.get("status");
        let query = "SELECT * FROM leads";
        const conditions = [];
        const params = [];
        if (filter) { conditions.push("classification = ?"); params.push(filter); }
        if (status) { conditions.push("status = ?"); params.push(status); }
        if (conditions.length) query += " WHERE " + conditions.join(" AND ");
        query += " ORDER BY created_at DESC LIMIT 200";
        const result = await env.DB.prepare(query).bind(...params).all();
        return json({ leads: result.results }, corsHeaders);
      }, corsHeaders);
    }

    if (path === "/api/admin/leads" && request.method === "POST") {
      return handleAdminAuth(request, env, async () => {
        const body = await request.json();
        const { status, notes, id } = body;
        if (!id) return json({ error: "id é obrigatório" }, corsHeaders, 400);
        const updates = [];
        const params = [];
        if (status) { updates.push("status = ?"); params.push(status); }
        if (notes !== undefined) { updates.push("notes = ?"); params.push(notes); }
        if (status === "contatado" && !notes) { updates.push("contacted_at = datetime('now')"); }
        if (!updates.length) return json({ error: "Nada para atualizar" }, corsHeaders, 400);
        params.push(id);
        await env.DB.prepare(`UPDATE leads SET ${updates.join(", ")} WHERE id = ?`).bind(...params).run();
        return json({ ok: true }, corsHeaders);
      }, corsHeaders);
    }

    // ---- Fallback: servir assets (landing page) ----
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response("Not found", { status: 404 });
  },
};

// ---- Handler: formulário tradicional ----
async function handleTriagem(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { name, phone, email, benefit_type, answers, cep } = body;

    if (!name || !phone || !benefit_type || !answers) {
      return json({ error: "name, phone, benefit_type e answers são obrigatórios" }, corsHeaders, 400);
    }

    const config = getBenefitConfig(benefit_type);
    if (!config) {
      return json({ error: "Tipo de benefício inválido" }, corsHeaders, 400);
    }

    const result = runTriagem(benefit_type, answers);
    const leadId = await salvarLead(env, { name, phone, email, benefit_type, answers, cep, result });

    const waLink = gerarLinkWhatsApp(
      env, name, config.label,
      { classification: result.class, classification_label: CLASSIFICATION_LABELS[result.class], rationale: result.rationale }
    );

    return json({
      lead_id: leadId,
      classification: result.class,
      classification_label: CLASSIFICATION_LABELS[result.class],
      rationale: result.rationale,
      whatsapp_link: waLink,
    }, corsHeaders);
  } catch (e) {
    return json({ error: "Erro interno: " + e.message }, corsHeaders, 500);
  }
}

// ---- Handler: Jarvis conversacional ----
async function handleJarvis(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { messages, state, name, phone } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return json({ error: "messages é obrigatório" }, corsHeaders, 400);
    }
    if (!env.ANTHROPIC_API_KEY) {
      return json({ error: "Jarvis ainda não configurado no servidor." }, corsHeaders, 500);
    }

    const { reply, state: novoEstado, resultado } = await chatWithJarvis(env, messages, state || {});

    let waLink = null;
    let leadId = null;

    // Se a triagem foi concluída nesta troca, salva o lead e gera o link de WhatsApp
    if (resultado && name && phone) {
      const config = getBenefitConfig(novoEstado.benefit_type);
      leadId = await salvarLead(env, {
        name, phone, email: null,
        benefit_type: novoEstado.benefit_type,
        answers: novoEstado.answers,
        cep: null,
        result: { class: resultado.classification, rationale: resultado.rationale }
      });
      waLink = gerarLinkWhatsApp(env, name, config ? config.label : novoEstado.benefit_type, resultado);
    }

    return json({
      reply,
      state: novoEstado,
      resultado,
      lead_id: leadId,
      whatsapp_link: waLink,
    }, corsHeaders);
  } catch (e) {
    console.error("jarvis handler error:", e);
    return json({ error: "Erro ao conversar com o Jarvis: " + e.message }, corsHeaders, 500);
  }
}

// ---- Utilitário: salva lead no D1 (usado tanto pelo formulário quanto pelo Jarvis) ----
async function salvarLead(env, { name, phone, email, benefit_type, answers, cep, result }) {
  const stmt = env.DB.prepare(
    `INSERT INTO leads (name, phone, email, benefit_type, answers_json, classification, rationale, cep, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'novo')`
  ).bind(
    name, phone, email || null, benefit_type,
    JSON.stringify(answers || {}), result.class, result.rationale, cep || null
  );
  const insertResult = await stmt.run();
  return insertResult.meta.last_row_id;
}

async function handleAdminAuth(request, env, handler, corsHeaders) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace("Bearer ", "");
  if (token !== env.ADMIN_TOKEN) {
    return json({ error: "Não autorizado" }, corsHeaders, 401);
  }
  return handler();
}

function json(data, corsHeaders, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
