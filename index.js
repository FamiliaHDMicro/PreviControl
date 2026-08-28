// PrevControl — Worker backend (Fase 1: Custo Zero)
// Serviço: landing page + API de triagem + painel admin.
// Sem IA paga, sem Telegram. Foco total em WhatsApp e D1.

import { getAllBenefits, getBenefitConfig, runTriagem, CLASSIFICATION_LABELS } from "./rules.js";

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

    // 1. Lista de benefícios
    if (path === "/api/benefits" && request.method === "GET") {
      return json({ benefits: getAllBenefits() }, corsHeaders);
    }

    // 2. Triagem do formulário
    if (path === "/api/triagem" && request.method === "POST") {
      return handleTriagem(request, env, corsHeaders);
    }

    // 3. Painel Admin (Listar leads)
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

    // 4. Painel Admin (Atualizar status do lead)
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

    // 5. Servir os arquivos do site (HTML, CSS, JS)
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Página não encontrada", { status: 404 });
  },
};

// ---- Função que processa a triagem e salva no banco ----
async function handleTriagem(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { name, phone, email, benefit_type, answers } = body;

    if (!name || !phone || !benefit_type || !answers) {
      return json({ error: "Dados incompletos. Nome, telefone e benefício são obrigatórios." }, corsHeaders, 400);
    }

    const config = getBenefitConfig(benefit_type);
    if (!config) {
      return json({ error: "Tipo de benefício inválido." }, corsHeaders, 400);
    }

    // Roda a lógica das regras (Custo Zero, sem IA)
    const result = runTriagem(benefit_type, answers);

    // Salva no banco de dados D1
    const stmt = env.DB.prepare(
      `INSERT INTO leads (name, phone, email, benefit_type, answers_json, classification, rationale, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, 'novo')`
    ).bind(
      name, 
      phone, 
      email || null, 
      benefit_type, 
      JSON.stringify(answers), 
      result.class, 
      result.rationale
    );
    
    const insertResult = await stmt.run();
    const leadId = insertResult.meta.last_row_id;

    // Monta a mensagem do WhatsApp
    const waMsg = encodeURIComponent(
      `Olá Cleiton! Sou *${name}*.\nFiz a triagem no site sobre: *${config.label}*.\n\n📊 *Resultado:* ${CLASSIFICATION_LABELS[result.class]}\n\n💬 *Resumo:* ${result.rationale}\n\nGostaria de agendar uma conversa!`
    );
    
    // Gera o link (se não for "sem direito", ou gera mesmo assim para o Cleiton avaliar)
    const waLink = `https://wa.me/${env.WHATSAPP_NUMBER}?text=${waMsg}`;

    return json({
      lead_id: leadId,
      classification: result.class,
      classification_label: CLASSIFICATION_LABELS[result.class],
      rationale: result.rationale,
      whatsapp_link: waLink,
    }, corsHeaders);

  } catch (e) {
    console.error("Erro na triagem:", e);
    return json({ error: "Erro interno no servidor: " + e.message }, corsHeaders, 500);
  }
}

// ---- Proteção do Painel Admin ----
async function handleAdminAuth(request, env, handler, corsHeaders) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace("Bearer ", "");
  
  if (token !== env.ADMIN_TOKEN) {
    return json({ error: "Token inválido. Acesso negado." }, corsHeaders, 401);
  }
  
  return handler();
}

// ---- Função auxiliar para retornar JSON ----
function json(data, corsHeaders, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
