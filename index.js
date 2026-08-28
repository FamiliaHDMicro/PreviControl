// PrevControl — Worker backend (Versão Única, sem imports externos)

const BENEFITS = {
  aposentadoria_idade: {
    label: "Aposentadoria por idade",
    questions: [
      { id: "age", label: "Qual sua idade?", type: "number", unit: "anos", required: true },
      { id: "contrib_years", label: "Quantos anos de contribuição você tem?", type: "number", unit: "anos", required: true },
      { id: "gender", label: "Você é homem ou mulher?", type: "choice", options: ["homem", "mulher"], required: true }
    ],
    evaluate(answers) {
      const age = Number(answers.age);
      const contrib = Number(answers.contrib_years);
      const isMale = answers.gender === "homem";
      if (!age || !contrib) return { class: "precisa_avaliacao", rationale: "Idade ou tempo de contribuição não informado." };
      const minAge = isMale ? 65 : 62;
      const minContrib = 15;
      if (age >= minAge && contrib >= minContrib) return { class: "provavel_direito", rationale: `Atende idade mínima (${minAge}) e tempo de contribuição (${minContrib} anos).` };
      if (age >= minAge - 2 && contrib >= minContrib) return { class: "precisa_avaliacao", rationale: `Próximo da idade mínima. Pode haver regra de transição.` };
      return { class: "sem_direito", rationale: `Ainda não atingiu idade mínima (${minAge} anos) ou tempo de contribuição (${minContrib} anos).` };
    }
  },
  aposentadoria_tempo: {
    label: "Aposentadoria por tempo de contribuição",
    questions: [
      { id: "gender", label: "Você é homem ou mulher?", type: "choice", options: ["homem", "mulher"], required: true },
      { id: "contrib_years", label: "Quantos anos de contribuição você tem?", type: "number", unit: "anos", required: true },
      { id: "started_before_2019", label: "Você já contribuía antes de 13/11/2019?", type: "choice", options: ["sim", "nao"], required: true }
    ],
    evaluate(answers) {
      const contrib = Number(answers.contrib_years);
      const isMale = answers.gender === "homem";
      const before2019 = answers.started_before_2019 === "sim";
      const target = isMale ? 35 : 30;
      if (contrib >= target && before2019) return { class: "provavel_direito", rationale: `Tempo de contribuição atingido (${contrib} anos). Entra nas regras de transição.` };
      if (!before2019) return { class: "sem_direito", rationale: "Aposentadoria apenas por tempo de contribuição acabou na Reforma de 2019." };
      return { class: "precisa_avaliacao", rationale: `Faltam ${target - contrib} anos de contribuição.` };
    }
  },
  auxilio_doenca: {
    label: "Auxílio-doença / Incapacidade",
    questions: [
      { id: "contrib_months", label: "Há quantos meses você contribui?", type: "number", unit: "meses", required: true },
      { id: "incapacity", label: "Você está impossibilitado de trabalhar por motivo de saúde?", type: "choice", options: ["sim", "nao"], required: true },
      { id: "has_medical_report", label: "Você tem laudo ou atestado médico?", type: "choice", options: ["sim", "nao"], required: true }
    ],
    evaluate(answers) {
      const contribMonths = Number(answers.contrib_months);
      const incapacitated = answers.incapacity === "sim";
      const hasReport = answers.has_medical_report === "sim";
      if (!incapacitated) return { class: "sem_direito", rationale: "Auxílio-doença é exclusivo para quem está temporariamente impossibilitado de trabalhar." };
      if (contribMonths >= 12 && hasReport) return { class: "provavel_direito", rationale: "Carência de 12 meses atingida e laudo médico apresentado." };
      if (contribMonths >= 12 && !hasReport) return { class: "precisa_avaliacao", rationale: "Você tem a carência, mas precisa do laudo médico para a perícia." };
      return { class: "precisa_avaliacao", rationale: `Faltam ${12 - contribMonths} meses de carência.` };
    }
  },
  salario_maternidade: {
    label: "Salário-maternidade",
    questions: [
      { id: "contrib_months", label: "Há quantos meses você contribui?", type: "number", unit: "meses", required: true },
      { id: "situation", label: "Qual sua situação?", type: "choice", options: ["Estou grávida", "Meu filho já nasceu", "Adotei ou tenho guarda judicial"], required: true }
    ],
    evaluate(answers) {
      const contribMonths = Number(answers.contrib_months);
      if (contribMonths >= 10) return { class: "provavel_direito", rationale: "Carência de 10 meses atingida." };
      return { class: "precisa_avaliacao", rationale: `Faltam ${10 - contribMonths} meses de carência.` };
    }
  },
  pensao_morte: {
    label: "Pensão por morte",
    questions: [
      { id: "relationship", label: "Qual seu parentesco com quem faleceu?", type: "choice", options: ["Marido/Esposa ou União Estável", "Filho(a) menor de 21 anos", "Filho(a) maior de 21 anos", "Pai ou Mãe", "Irmão(ã)"], required: true },
      { id: "deceased_contributed", label: "Quem faleceu pagava INSS ou era aposentado?", type: "choice", options: ["sim", "nao", "nao_sei"], required: true }
    ],
    evaluate(answers) {
      if (answers.deceased_contributed === "nao") return { class: "sem_direito", rationale: "Para pensão por morte, quem faleceu precisava ser segurado do INSS." };
      const eligible = ["Marido/Esposa ou União Estável", "Filho(a) menor de 21 anos", "Pai ou Mãe"];
      if (eligible.includes(answers.relationship)) return { class: "provavel_direito", rationale: "Você é dependente direto e há grande chance de direito à pensão." };
      return { class: "precisa_avaliacao", rationale: "Precisamos analisar seu caso especificamente." };
    }
  },
  bpc_loas: {
    label: "BPC / LOAS",
    questions: [
      { id: "age", label: "Quantos anos você tem?", type: "number", unit: "anos", required: true },
      { id: "incapacity", label: "Você tem alguma deficiência que dificulta sua vida independente?", type: "choice", options: ["sim", "nao"], required: true },
      { id: "family_income", label: "A renda por pessoa da sua casa é menor que 1/4 do salário mínimo?", type: "choice", options: ["sim", "nao", "nao_sei"], required: true }
    ],
    evaluate(answers) {
      const age = Number(answers.age);
      const hasDeficiency = answers.incapacity === "sim";
      const lowIncome = answers.family_income === "sim";
      if ((age >= 65 || hasDeficiency) && lowIncome) return { class: "provavel_direito", rationale: "Você atende aos critérios de idade/deficiência e renda." };
      if (age < 65 && !hasDeficiency) return { class: "sem_direito", rationale: "BPC exige 65 anos ou mais, ou deficiência comprovada." };
      return { class: "precisa_avaliacao", rationale: "Precisamos analisar melhor sua situação de renda." };
    }
  }
};

const CLASSIFICATION_LABELS = {
  provavel_direito: "✅ Provável Direito",
  precisa_avaliacao: "⚠️ Precisa de Análise do Cleiton",
  sem_direito: "❌ Sem Direito no Momento"
};

function getAllBenefits() {
  return Object.entries(BENEFITS).map(([key, config]) => ({ key, label: config.label, questions: config.questions }));
}

function getBenefitConfig(benefitType) {
  return BENEFITS[benefitType] || null;
}

function runTriagem(benefitType, answers) {
  const config = BENEFITS[benefitType];
  if (!config) return { class: "precisa_avaliacao", rationale: "Tipo de benefício não reconhecido." };
  return config.evaluate(answers);
}

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

    if (path === "/" || !path.startsWith("/api/")) {
      if (env.ASSETS) return env.ASSETS.fetch(request);
    }

    if (path === "/api/benefits" && request.method === "GET") {
      return json({ benefits: getAllBenefits() }, corsHeaders);
    }

    if (path === "/api/triagem" && request.method === "POST") {
      return handleTriagem(request, env, corsHeaders);
    }

    if (path === "/api/admin/leads" && request.method === "GET") {
      return handleAdminAuth(request, env, async () => {
        const result = await env.DB.prepare("SELECT * FROM leads ORDER BY created_at DESC LIMIT 200").all();
        return json({ leads: result.results }, corsHeaders);
      }, corsHeaders);
    }

    if (path === "/api/admin/leads" && request.method === "POST") {
      return handleAdminAuth(request, env, async () => {
        const body = await request.json();
        const { status, notes, id } = body;
        if (!id) return json({ error: "id obrigatório" }, corsHeaders, 400);
        await env.DB.prepare(`UPDATE leads SET status = ?, notes = ? WHERE id = ?`).bind(status || 'novo', notes || '', id).run();
        return json({ ok: true }, corsHeaders);
      }, corsHeaders);
    }

    return new Response("Página não encontrada", { status: 404 });
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

    await env.DB.prepare(
      `INSERT INTO leads (name, phone, email, benefit_type, answers_json, classification, rationale, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, 'novo')`
    ).bind(name, phone, email || null, benefit_type, JSON.stringify(answers), result.class, result.rationale).run();

    const waMsg = encodeURIComponent(
      `Olá Cleiton! Sou *${name}*.\nTriagem: *${config.label}*.\nResultado: ${CLASSIFICATION_LABELS[result.class]}.\nResumo: ${result.rationale}`
    );
    const waLink = `https://wa.me/${env.WHATSAPP_NUMBER}?text=${waMsg}`;

    return json({
      classification: result.class,
      classification_label: CLASSIFICATION_LABELS[result.class],
      rationale: result.rationale,
      whatsapp_link: waLink,
    }, corsHeaders);

  } catch (e) {
    return json({ error: "Erro: " + e.message }, corsHeaders, 500);
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
