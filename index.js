// index.js — PrevControl Worker (Terminal Burro)
// Custo zero · Sem IA · Sem juridiquês
import {
  getAllBenefits,
  getBenefitConfig,
  runTriagem,
  CLASSIFICATION_LABELS,
  ROUTER_QUESTION,
  CAMPO_LIVRE_OPCIONAL,
  resolveBenefitKey
} from "./rules.js";

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

    // API: Login
    if (path === "/api/admin/login" && request.method === "POST") {
      return handleLogin(request, env, corsHeaders);
    }

    // API: Salvar lead
    if (path === "/api/leads" && request.method === "POST") {
      return handleLeads(request, env, corsHeaders);
    }

    // API: Listar leads
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

    // API: Atualizar lead
    if (path === "/api/admin/leads" && request.method === "POST") {
      return handleAdminAuth(request, env, async () => {
        const body = await request.json();
        const { status, notes, id } = body;
        if (!id) return json({ error: "id é obrigatório" }, corsHeaders, 400);
        const updates = [];
        const params = [];
        if (status) { updates.push("status = ?"); params.push(status); }
        if (notes !== undefined) { updates.push("notes = ?"); params.push(notes); }
        if (status === "contatado" && !notes) {
          updates.push("contacted_at = datetime('now')");
        }
        if (!updates.length) return json({ error: "Nada para atualizar" }, corsHeaders, 400);
        params.push(id);
        await env.DB.prepare(
          `UPDATE leads SET ${updates.join(", ")} WHERE id = ?`
        ).bind(...params).run();
        return json({ ok: true }, corsHeaders);
      }, corsHeaders);
    }

    // API: Dados do formulário (para o frontend)
    if (path === "/api/config" && request.method === "GET") {
      return json({
        router: ROUTER_QUESTION,
        benefits: getAllBenefits(),
        campoLivre: CAMPO_LIVRE_OPCIONAL
      }, corsHeaders);
    }

    // Fallback: servir assets estáticos (HTML/CSS/JS da pasta public/)
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
};

async function handleLogin(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { username, password } = body;
    const users = [
      { user: "admin", pass: env.ADMIN_TOKEN, role: "Administrador (Cleiton)" },
      { user: "atendimento1", pass: env.USER1_TOKEN, role: "Atendente 01" },
      { user: "atendimento2", pass: env.USER2_TOKEN, role: "Atendente 02" }
    ];
    const found = users.find(u => u.user === username && u.pass === password);
    if (!found) return json({ error: "Usuário ou senha incorretos" }, corsHeaders, 401);
    return json({ ok: true, role: found.role }, corsHeaders);
  } catch (e) {
    return json({ error: "Erro na requisição" }, corsHeaders, 400);
  }
}

async function handleLeads(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { nome, telefone, routerValue, answers, observacao } = body;
    if (!nome || !telefone || !routerValue) {
      return json({ ok: false, message: "Nome, telefone e situação são obrigatórios." }, corsHeaders, 400);
    }
    const benefitKey = resolveBenefitKey(routerValue);
    const config = getBenefitConfig(benefitKey);
    if (!config) {
      return json({ ok: false, message: "Situação não reconhecida." }, corsHeaders, 400);
    }
    const resultado = runTriagem(benefitKey, answers || {});
    const classificationLabel = CLASSIFICATION_LABELS[resultado.class] || resultado.class;

    const resumo = montarResumo({
      nome, telefone, benefitLabel: config.label, routerValue,
      answers, observacao, resultado, classificationLabel
    });

    if (env.DB) {
      await env.DB.prepare(
        `INSERT INTO leads (name, phone, email, benefit_type, answers_json, classification, rationale, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'novo')`
      ).bind(
        nome, telefone, null, benefitKey,
        JSON.stringify(answers || {}), resultado.class, resultado.rationale
      ).run();
    }

    return json({
      ok: true, resumo,
      classification: resultado.class,
      classification_label: classificationLabel,
      rationale: resultado.rationale
    }, corsHeaders);
  } catch (e) {
    console.error("erro /api/leads:", e);
    return json({ ok: false, message: "Erro ao salvar: " + e.message }, corsHeaders, 500);
  }
}

function montarResumo({ nome, telefone, benefitLabel, routerValue, answers, observacao, resultado, classificationLabel }) {
  const linhas = [
    `Olá! Sou ${nome} (${telefone}).`,
    `Situação: ${benefitLabel}${routerValue === "bpc_loas_renovacao" ? " — Renovação/Revisão periódica" : ""}`,
    ``,
    ...Object.entries(answers || {}).map(([k, v]) => `- ${k}: ${v}`),
  ];
  if (observacao) linhas.push(``, `Observação da pessoa: ${observacao}`);
  linhas.push(
    ``,
    `📋 Resultado da triagem automática: ${classificationLabel}`,
    `📝 ${resultado.rationale}`,
    ``,
    `Este é um resultado inicial e automático — não substitui análise jurídica completa.`
  );
  return linhas.join("\n");
}

async function handleAdminAuth(request, env, handler, corsHeaders) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace("Bearer ", "");
  const validTokens = [env.ADMIN_TOKEN, env.USER1_TOKEN, env.USER2_TOKEN];
  if (!validTokens.includes(token)) {
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
