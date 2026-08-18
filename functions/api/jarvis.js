// Cloudflare Pages Function — POST /api/jarvis
// Endpoint do chat "Pergunte ao Jarvis" da landing page do Escritório Cleiton.
//
// COMO CONFIGURAR:
// 1. No painel do Cloudflare Pages do seu projeto, vá em:
//    Settings > Environment variables > Add variable
// 2. Crie uma variável chamada ANTHROPIC_API_KEY, tipo "Secret" (encrypted),
//    e cole sua API key da Anthropic (começa com sk-ant-...).
// 3. Faça isso tanto em Production quanto em Preview.
// 4. Em Settings > Functions > D1 database bindings, garanta que existe um
//    binding chamado DB apontando pro banco prevcontrole-db.
// 5. Salve este arquivo em: functions/api/jarvis.js na raiz do seu projeto
//    (mesma pasta onde já ficam as outras functions/api do site).
// 6. Suba pro GitHub — o Cloudflare Pages faz o deploy automático.

const SYSTEM_PROMPT_BASE = `Você é o Jarvis, assistente virtual do Escritório Cleiton, especializado em orientação previdenciária e trabalhista no Brasil (INSS, aposentadoria, auxílio-doença, pensão por morte, BPC/LOAS, direitos trabalhistas).

Regras:
- Responda em português, de forma simples, direta e sem juridiquês, em no máximo 4 frases.
- Você dá orientação geral, NUNCA um parecer jurídico definitivo sobre o caso da pessoa.
- Sempre que fizer sentido, incentive a pessoa a fazer a triagem completa no formulário acima ou falar com o escritório pelo WhatsApp para uma análise real do caso dela.
- Se a pergunta não tiver relação com previdência/trabalhista/INSS/BPC, redirecione educadamente para esses temas.
- Nunca invente números de lei, prazos ou valores que você não tenha certeza — nesses casos, oriente a pessoa a confirmar no Meu INSS ou com o escritório.`;

// Limite simples de taxa por IP (em memória — reseta a cada novo deploy/cold start).
// Para algo mais robusto entre deploys, dá pra trocar por Cloudflare KV depois.
const rateLimitMap = new Map();
const RATE_LIMIT = 5; // perguntas
const RATE_WINDOW_MS = 60 * 1000; // por minuto

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count += 1;
  return true;
}

// Palavras-chave simples por categoria, pra decidir quais normas buscar no D1
// com base na pergunta da pessoa. Dá pra refinar isso depois.
const CATEGORY_KEYWORDS = {
  'BPC/LOAS': ['bpc', 'loas', 'assistencial', 'deficiencia', 'deficiência'],
  'Aposentadoria': ['aposentadoria', 'aposentar', 'tempo de contribuição', 'idade minima', 'idade mínima'],
  'Auxílio-doença': ['auxilio-doenca', 'auxílio-doença', 'auxilio doenca', 'incapacidade', 'afastamento'],
  'Pensão por morte': ['pensao por morte', 'pensão por morte', 'dependente', 'falecimento'],
  'Trabalhista': ['clt', 'demissao', 'demissão', 'rescisao', 'rescisão', 'ferias', 'férias', 'fgts'],
};

function detectCategories(question) {
  const normalized = question.toLowerCase();
  const found = Object.entries(CATEGORY_KEYWORDS)
    .filter(([, keywords]) => keywords.some((kw) => normalized.includes(kw)))
    .map(([categoria]) => categoria);
  return found;
}

async function buscarNormas(db, question) {
  if (!db) return [];
  try {
    const categorias = detectCategories(question);
    let stmt;
    if (categorias.length > 0) {
      const placeholders = categorias.map(() => '?').join(',');
      stmt = db
        .prepare(`SELECT categoria, conteudo, fonte FROM normas WHERE categoria IN (${placeholders}) ORDER BY criado_em DESC LIMIT 8`)
        .bind(...categorias);
    } else {
      // Sem categoria clara na pergunta: pega as normas mais recentes como contexto geral.
      stmt = db.prepare('SELECT categoria, conteudo, fonte FROM normas ORDER BY criado_em DESC LIMIT 8');
    }
    const { results } = await stmt.all();
    return results || [];
  } catch (err) {
    console.error('Erro ao buscar normas no D1:', err);
    return [];
  }
}

function montarSystemPrompt(normas) {
  if (!normas || normas.length === 0) return SYSTEM_PROMPT_BASE;

  const bloco = normas
    .map((n) => `- [${n.categoria}] ${n.conteudo}${n.fonte ? ` (Fonte: ${n.fonte})` : ''}`)
    .join('\n');

  return `${SYSTEM_PROMPT_BASE}

Use as normas abaixo, cadastradas pelo escritório, como base para fundamentar sua resposta sempre que forem relevantes para a pergunta. Não cite normas que não estejam nesta lista:
${bloco}`;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!checkRateLimit(ip)) {
      return jsonResponse({ error: 'Muitas perguntas em pouco tempo. Aguarde um minuto e tente de novo.' }, 429);
    }

    const body = await request.json().catch(() => null);
    const question = body && typeof body.question === 'string' ? body.question.trim() : '';

    if (!question) {
      return jsonResponse({ error: 'Envie uma pergunta.' }, 400);
    }
    if (question.length > 500) {
      return jsonResponse({ error: 'Pergunta muito longa. Tente resumir.' }, 400);
    }

    if (!env.ANTHROPIC_API_KEY) {
      return jsonResponse({ error: 'Chat ainda não configurado no servidor.' }, 500);
    }

    const normas = await buscarNormas(env.DB, question);
    const systemPrompt = montarSystemPrompt(normas);

    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 300,
        system: systemPrompt,
        messages: [{ role: 'user', content: question }],
      }),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text().catch(() => '');
      console.error('Anthropic API error:', apiRes.status, errText);
      return jsonResponse({ error: 'Não consegui responder agora. Tente novamente em instantes.' }, 502);
    }

    const data = await apiRes.json();
    const answer = (data.content || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    return jsonResponse({ answer: answer || 'Não consegui gerar uma resposta agora. Tente reformular a pergunta.' });
  } catch (err) {
    console.error('jarvis.js error:', err);
    return jsonResponse({ error: 'Erro interno. Tente novamente.' }, 500);
  }
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
