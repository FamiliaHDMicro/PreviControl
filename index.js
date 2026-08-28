// PrevControl — Worker backend (Fase 1: Custo Zero)
import { getAllBenefits, getBenefitConfig, runTriagem, CLASSIFICATION_LABELS } from "./src/rules.js";

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

    if (path === "/api/benefits" && request.method === "GET") {
      return json({ benefits: getAllBenefits() }, corsHeaders);
    }

    if (path === "/api/triagem" && request.method === "POST") {
      return handleTriagem(request, env, corsHeaders);
    }

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
        if (status === "contatado") { updates.push("contacted_at = datetime('now')"); }
        if (!updates.length) return json({ error: "Nada para atualizar" }, corsHeaders, 400);
        params.push(id);
        await env.DB.prepare(`UPDATE leads SET ${updates.join(", ")} WHERE id = ?`).bind(...params).run();
        return json({ ok: true }, corsHeaders);
      }, corsHeaders);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
};

async function handleTriagem(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { name, phone, email, benefit_type, answers } = body;
    if (!name || !phone || !benefit_type || !answers) {
      return json({ error: "Dados incompletos" }, corsHeaders, 400);
    }
    const config = getBenefitConfig(benefit_type);
    if (!config) return json({ error: "Benefício inválido" }, corsHeaders, 400);
    const result = runTriagem(benefit_type, answers);
    const stmt = env.DB.prepare(
      `INSERT INTO leads (name, phone, email, benefit_type, answers_json, classification, rationale, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'novo')`
    ).bind(name, phone, email || null, benefit_type, JSON.stringify(answers), result.class, result.rationale);
    await stmt.run();
    const waMsg = encodeURIComponent(`Olá Cleiton! Sou *${name}*. Triagem: *${config.label}*. Resultado: ${CLASSIFICATION_LABELS[result.class]}. ${result.rationale}`);
    const waLink = `https://wa.me/${env.WHATSAPP_NUMBER}?text=${waMsg}`;
    return json({
      classification: result.class,
      classification_label: CLASSIFICATION_LABELS[result.class],
      rationale: result.rationale,
      whatsapp_link: waLink,
    }, corsHeaders);
  } catch (e) {
    return json({ error: e.message }, corsHeaders, 500);
  }
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
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });
}
