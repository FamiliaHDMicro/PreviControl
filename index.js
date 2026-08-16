// ConsultaRápida — Worker backend
// Serviço: landing page (assets) + API REST (/api/*) + painel admin (/admin)
// Integrações: JARVIS (Workers AI), Telegram bot, D1, R2 (futuro)

import { getAllBenefits, getBenefitConfig, runTriagem, CLASSIFICATION_LABELS, STATUS_LABELS } from "./rules.js";
import { chatWithJarvis } from "./jarvis.js";
import { handleTelegramWebhook, notifyCleitonFile, setupTelegramWebhook } from "./telegram.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ---- CORS (dev) ----
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // ---- Rotas da API ----

    // Benefícios (lista perguntas para o formulário)
    if (path === "/api/benefits" && request.method === "GET") {
      return json({ benefits: getAllBenefits() }, corsHeaders);
    }

    // Triagem (formulário da landing page)
    if (path === "/api/triagem" && request.method === "POST") {
      return handleTriagem(request, env, ctx, corsHeaders);
    }

    // Chat JARVIS (IA especializada)
    if (path === "/api/chat" && request.method === "POST") {
      return handleChat(request, env, corsHeaders);
    }

    // Telegram webhook (recebe mensagens do bot)
    if (path === "/api/telegram/webhook" && request.method === "POST") {
      return handleTelegramWebhook(request, env);
    }

    // Telegram setup (ativa webhook — chamado uma vez)
    if (path === "/api/telegram/setup" && request.method === "POST") {
      return handleAdminAuth(request, env, async () => {
        const workerUrl = url.origin;
        const result = await setupTelegramWebhook(env, workerUrl);
        return json(result, corsHeaders);
      }, corsHeaders);
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

    // ---- Fallback: servir assets (landing page, painel) ----
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response("Not found", { status: 404 });
  },
};

// ---- Handlers ----

async function handleTriagem(request, env, ctx, corsHeaders) {
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

    // Salvar lead no banco — file, provavel_direito e precisa_avaliacao chegam ao painel
    // sem_direito é salva para métricas mas não aparece no painel principal
    const stmt = env.DB.prepare(
      `INSERT INTO leads (name, phone, email, benefit_type, answers_json, classification, rationale, cep)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      name, phone, email || null, benefit_type,
      JSON.stringify(answers), result.class, result.rationale, cep || null
    );
    const insertResult = await stmt.run();
    const leadId = insertResult.meta.last_row_id;

    // Se for FILÉ, notifica o Cleiton via Telegram (assíncrono, não bloqueia resposta)
    if (result.class === "file") {
      ctx.waitUntil(notifyCleitonFile(env, {
        id: leadId,
        name,
        phone,
        benefit_label: config.label,
      }));
    }

    // Monta link de WhatsApp pré-preenchido para casos qualificados
    const waMsg = encodeURIComponent(
      `Olá! Sou ${name}. Fiz a triagem no site (${config.label}) e o resultado foi: ${CLASSIFICATION_LABELS[result.class]}. Gostaria de falar com o especialista.`
    );
    const waLink = result.class !== "sem_direito"
      ? `https://wa.me/${env.WHATSAPP_NUMBER}?text=${waMsg}`
      : null;

    // Para "sem direito" — oferece serviços de auditoria e advocacia
    const semDireitoOffer = result.class === "sem_direito" ? {
      title: "Mesmo sem direito a este benefício, você não está sozinho.",
      message: "Podemos te ajudar de outras formas. Temos serviços de auditoria de documentos e parceria com escritórios de advocacia da sua região.",
      cta: "Posso entrar em contato com você para conversar sobre outras opções?",
      whatsapp_link: `https://wa.me/${env.WHATSAPP_NUMBER}?text=${encodeURIComponent(`Olá! Sou ${name}. Fiz a triagem e não me enquadrei no benefício, mas quero saber sobre auditoria e outras opções.`)}`,
    } : null;

    return json({
      lead_id: leadId,
      classification: result.class,
      classification_label: CLASSIFICATION_LABELS[result.class],
      rationale: result.rationale,
      whatsapp_link: waLink,
      telegram_link: env.TELEGRAM_BOT_URL,
      sem_direito_offer: semDireitoOffer,
    }, corsHeaders);
  } catch (e) {
    return json({ error: "Erro interno: " + e.message }, corsHeaders, 500);
  }
}

async function handleChat(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { messages } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return json({ error: "messages é obrigatório" }, corsHeaders, 400);
    }

    const reply = await chatWithJarvis(env, messages);

    return json({ reply }, corsHeaders);
  } catch (e) {
    return json({ error: "Erro ao processar chat: " + e.message }, corsHeaders, 500);
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
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}