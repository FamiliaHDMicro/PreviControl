// jarvis.js — Jarvis conversacional do PrevControl (Escritório Cleiton)
// Conduz a triagem em forma de conversa, seguindo o roteiro de perguntas de rules.js.
// Ao final, gera um "ticket" (resumo) enviado à pessoa via link de WhatsApp.
// Modelo: Claude Haiku (custo baixo). Apenas texto — sem geração de voz.

import { getBenefitConfig, runTriagem, CLASSIFICATION_LABELS } from "./rules.js";

const SYSTEM_PROMPT = `Você é o Jarvis, assistente virtual de previdência social do Escritório Cleiton.

## SEU PAPEL
Conduzir uma conversa acolhedora para ajudar a pessoa a descobrir se tem direito a algum benefício do INSS ou direito trabalhista. Você é uma conversa de verdade, gentil e simples — não um formulário.

## COMO CONDUZIR
1. Pergunte, de forma natural, qual é a dúvida ou situação da pessoa, para identificar o benefício (aposentadoria por idade, por tempo de contribuição, auxílio-doença, salário-maternidade, pensão por morte, BPC/LOAS, rescisão trabalhista, ou revisão de benefício).
2. Depois de identificar o benefício, faça as perguntas necessárias UMA DE CADA VEZ. Espere a resposta antes de seguir para a próxima.
3. Use linguagem simples, sem juridiquês. Explique siglas na primeira vez (ex: "BPC, que é um benefício para quem tem baixa renda").
4. Se a pessoa mencionar que vai enviar foto de documento, avise que pode usar o botão de anexo na tela, e continue a conversa normalmente.

## TOM DE VOZ
- Acolhedor, paciente, nunca apressado ou seco.
- Se a pessoa perguntar de novo algo já dito (mesmo com outras palavras), nunca dê a entender que ela "já deveria saber". Responda de forma breve e gentil, como se fosse natural perguntar de novo.
- Frases curtas — no máximo 3-4 frases por resposta, a não ser que a pessoa peça mais detalhes.
- Trate a pessoa com respeito e dignidade.

## REGRAS IMPORTANTES
- Nunca invente números de lei, prazos ou valores sem certeza — oriente a confirmar no Meu INSS ou com o escritório.
- Você dá orientação geral, nunca um parecer jurídico definitivo.
- Se a pergunta não tiver relação com previdência/trabalhista/INSS, redirecione educadamente ao tema.

## FORMATO DE RESPOSTA (PARA O SISTEMA, invisível à pessoa)
Quando identificar o benefício, inclua em linha separada:
[BENEFICIO: chave_do_beneficio]
Use exatamente uma destas chaves: aposentadoria_idade, aposentadoria_tempo, auxilio_doenca, salario_maternidade, pensao_morte, bpc_loas, trabalhista, revisao

Quando estiver perguntando algo do roteiro estruturado, inclua:
[PERGUNTANDO: id_da_pergunta]

Quando a pessoa responder essa pergunta, inclua a resposta interpretada:
[RESPOSTA: id_da_pergunta=valor]

Continue a conversa normalmente ao redor dessas marcações.`;

const rateLimitMap = new Map();
const RATE_LIMIT = 15;
const RATE_WINDOW_MS = 60 * 1000;

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

function extrairMarcacoes(texto) {
  const beneficioMatch = texto.match(/\[BENEFICIO:\s*(\w+)\]/);
  const perguntandoMatch = texto.match(/\[PERGUNTANDO:\s*(\w+)\]/);
  const respostaMatch = texto.match(/\[RESPOSTA:\s*(\w+)=([^\]]+)\]/);

  const textoLimpo = texto
    .replace(/\[BENEFICIO:\s*\w+\]/g, "")
    .replace(/\[PERGUNTANDO:\s*\w+\]/g, "")
    .replace(/\[RESPOSTA:\s*\w+=[^\]]+\]/g, "")
    .trim();

  return {
    textoLimpo,
    beneficio: beneficioMatch ? beneficioMatch[1] : null,
    perguntando: perguntandoMatch ? perguntandoMatch[1] : null,
    resposta: respostaMatch ? { id: respostaMatch[1], valor: respostaMatch[2].trim() } : null
  };
}

async function chamarClaude(env, messages) {
  const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 400,
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }
      ],
      messages
    }),
  });

  if (!apiRes.ok) {
    const errText = await apiRes.text().catch(() => "");
    console.error("Anthropic error:", apiRes.status, errText);
    throw new Error("Falha ao consultar o Jarvis");
  }

  const data = await apiRes.json();
  return (data.content || [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

export function checkJarvisRateLimit(ip) {
  return checkRateLimit(ip);
}

export async function chatWithJarvis(env, messages, triagemState = {}) {
  const respostaBruta = await chamarClaude(env, messages);
  const { textoLimpo, beneficio, perguntando, resposta } = extrairMarcacoes(respostaBruta);

  const novoEstado = { ...triagemState };

  if (beneficio && !novoEstado.benefit_type) {
    novoEstado.benefit_type = beneficio;
    novoEstado.answers = {};
  }
  if (resposta && novoEstado.answers) {
    novoEstado.answers[resposta.id] = resposta.valor;
  }
  if (perguntando) {
    novoEstado.perguntaAtual = perguntando;
  }

  let resultadoTriagem = null;
  if (novoEstado.benefit_type && novoEstado.answers) {
    const config = getBenefitConfig(novoEstado.benefit_type);
    if (config) {
      const requiredQuestions = config.questions.filter((q) => q.required);
      const todasRespondidas = requiredQuestions.every((q) => novoEstado.answers[q.id] !== undefined);
      if (todasRespondidas) {
        resultadoTriagem = runTriagem(novoEstado.benefit_type, novoEstado.answers);
        novoEstado.resultado = resultadoTriagem;
        novoEstado.finalizado = true;
      }
    }
  }

  return {
    reply: textoLimpo,
    state: novoEstado,
    resultado: resultadoTriagem
      ? {
          classification: resultadoTriagem.class,
          classification_label: CLASSIFICATION_LABELS[resultadoTriagem.class],
          rationale: resultadoTriagem.rationale
        }
      : null
  };
}

// Gera o ticket (resumo + compromisso) que a pessoa recebe ao final da conversa
export function gerarTicket(nome, benefitLabel, resultado, temDocumentos) {
  const linhas = [
    `Olá ${nome}! Este é o resumo da sua conversa com o Jarvis:`,
    ``,
    `📋 Assunto: ${benefitLabel}`,
    `✅ Resultado: ${resultado.classification_label}`,
    `📝 ${resultado.rationale}`,
  ];
  if (temDocumentos) {
    linhas.push(`📎 Documentos recebidos durante a conversa.`);
  }
  linhas.push(
    ``,
    `Este é um resultado inicial e automático — não substitui uma análise completa.`,
    `O Escritório Cleiton vai revisar seu caso e entrar em contato.`
  );
  return linhas.join("\n");
}

export function gerarLinkWhatsApp(env, nome, benefitLabel, resultado, temDocumentos = false) {
  const ticket = gerarTicket(nome, benefitLabel, resultado, temDocumentos);
  return `https://wa.me/${env.WHATSAPP_NUMBER}?text=${encodeURIComponent(ticket)}`;
}
