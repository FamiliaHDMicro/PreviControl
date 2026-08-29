// PrevControl — Motor de regras determinístico (não é IA generativa)
// Cada benefício tem critérios fixos baseados na legislação.
// Resultado: provavel_direito | precisa_avaliacao | sem_direito
//
// ATUALIZAÇÃO: aposentadoria_idade agora separa tempo de contribuição em
// anos + meses (mais preciso que um único campo arredondado em anos).
//
// IMPORTANTE: estes são critérios SIMPLIFICADOS para triagem inicial.
// As regras completas devem ser validadas com o Cleiton/Dra. antes da Fase 3.

// ---- Pergunta 0 (roteador): linguagem simples -> benefício técnico ----
// Usada pela interface ANTES das perguntas específicas de cada benefício.
// Não é obrigatório perguntar CPF, endereço completo ou renda exata aqui —
// isso fica para quando a pessoa já decidiu seguir com o escritório.
const ROUTER_QUESTION = {
  id: "situacao_router",
  label: "O que está acontecendo com você hoje?",
  type: "choice",
  options: [
    { value: "aposentadoria_idade", label: "Estou perto da idade de aposentar" },
    { value: "aposentadoria_tempo", label: "Já tenho bastante tempo de contribuição e quero saber se posso me aposentar" },
    { value: "auxilio_doenca", label: "Estou doente/afastado e não consigo trabalhar" },
    { value: "salario_maternidade", label: "Estou grávida, tive um filho recentemente ou adotei" },
    { value: "pensao_morte", label: "Perdi alguém da família que era aposentado/segurado" },
    { value: "bpc_loas", label: "Tenho deficiência ou sou idoso de baixa renda" },
    { value: "bpc_loas_renovacao", label: "Já recebo BPC/LOAS e preciso renovar (revisão periódica)" },
    { value: "trabalhista", label: "Fui demitido ou tenho dúvida trabalhista" },
    { value: "revisao", label: "Já recebo um benefício e acho o valor errado" }
  ]
};

// Campo final opcional, livre, sem obrigar detalhes sensíveis
const CAMPO_LIVRE_OPCIONAL = {
  id: "observacao_livre",
  label: "Quer contar mais alguma coisa? (opcional)",
  type: "text",
  required: false
};

// "bpc_loas_renovacao" usa exatamente as mesmas perguntas e regras do bpc_loas —
// é o mesmo teste de elegibilidade, só que no contexto de renovação/revisão bienal.
function resolveBenefitKey(routerValue) {
  if (routerValue === "bpc_loas_renovacao") return "bpc_loas";
  return routerValue;
}

const BENEFITS = {
  aposentadoria_idade: {
    label: "Aposentadoria por idade",
    questions: [
      { id: "age", label: "Qual sua idade?", type: "number", unit: "anos", required: true },
      { id: "contrib_years", label: "Quantos anos de contribuição você tem?", type: "number", unit: "anos", required: true },
      { id: "contrib_months", label: "E quantos meses (além dos anos acima)?", type: "number", unit: "meses", required: false },
      { id: "gender", label: "Você é homem ou mulher?", type: "choice", options: ["homem", "mulher"], required: true }
    ],
    evaluate(answers) {
      const age = Number(answers.age);
      const contribYears = Number(answers.contrib_years) || 0;
      const contribMonths = Number(answers.contrib_months) || 0;
      const contrib = contribYears + (contribMonths / 12);
      const isMale = answers.gender === "homem";
      if (!age || !contribYears)
        return { class: "precisa_avaliacao", rationale: "Idade ou tempo de contribuição não informado." };
      const minAge = isMale ? 65 : 62;
      const minContrib = 15;
      if (age >= minAge && contrib >= minContrib) {
        return { class: "provavel_direito", rationale: `Atende idade mínima (${minAge}) e tempo de contribuição (${contribYears} anos e ${contribMonths} meses, mínimo ${minContrib} anos).` };
      }
      const extraContrib = contrib - minContrib;
      if (extraContrib > 0) {
        const reducedAge = minAge - extraContrib * 0.5;
        if (age >= reducedAge) {
          return { class: "provavel_direito", rationale: "Pode se encaixar na regra de transição (idade reduzida por contribuição excedente)." };
        }
      }
      if (age >= minAge - 2 && contrib >= minContrib) {
        return { class: "precisa_avaliacao", rationale: "Próximo da idade mínima. Pode haver regra de transição aplicável — precisa análise." };
      }
      return { class: "sem_direito", rationale: `Faltam ${Math.max(minAge - age, 0)} anos de idade ou tempo de contribuição insuficiente (tem ${contribYears} anos e ${contribMonths} meses, mínimo ${minContrib} anos).` };
    }
  },

  aposentadoria_tempo: {
    label: "Aposentadoria por tempo de contribuição",
    questions: [
      { id: "contrib_years", label: "Quantos anos de contribuição você tem?", type: "number", unit: "anos", required: true },
      { id: "gender", label: "Você é homem ou mulher?", type: "choice", options: ["homem", "mulher"], required: true },
      { id: "started_before_2019", label: "Você já contribuía antes de 13/11/2019?", type: "choice", options: ["sim", "nao"], required: true }
    ],
    evaluate(answers) {
      const contrib = Number(answers.contrib_years);
      const isMale = answers.gender === "homem";
      const before2019 = answers.started_before_2019 === "sim";
      const target = isMale ? 35 : 30;
      if (!contrib)
        return { class: "precisa_avaliacao", rationale: "Tempo de contribuição não informado." };
      if (contrib >= target && before2019) {
        return { class: "provavel_direito", rationale: `Possui ${contrib} anos (mínimo ${target}) e já contribuía antes da Reforma — regra de transição aplicável.` };
      }
      if (contrib >= target - 2 && before2019) {
        return { class: "precisa_avaliacao", rationale: `Faltam poucos anos (${target - contrib}). Com pedágio, pode haver direito — precisa análise.` };
      }
      if (!before2019) {
        return { class: "sem_direito", rationale: "Aposentadoria por tempo puro foi extinta na Reforma (EC 103/2019). Sem regra de transição aplicável." };
      }
      return { class: "sem_direito", rationale: `Faltam ${target - contrib} anos de contribuição.` };
    }
  },

  auxilio_doenca: {
    label: "Auxílio-doença / incapacidade",
    questions: [
      { id: "contrib_months", label: "Quantos meses de contribuição você tem?", type: "number", unit: "meses", required: true },
      { id: "incapacity", label: "Você está impossibilitado de trabalhar por motivo de saúde?", type: "choice", options: ["sim", "nao"], required: true },
      { id: "has_medical_report", label: "Você tem laudo médico ou atestado?", type: "choice", options: ["sim", "nao"], required: true }
    ],
    evaluate(answers) {
      const contribMonths = Number(answers.contrib_months);
      const incapacitated = answers.incapacity === "sim";
      const hasReport = answers.has_medical_report === "sim";
      if (!incapacitated)
        return { class: "sem_direito", rationale: "Auxílio-doença exige incapacidade para o trabalho." };
      if (contribMonths >= 12 && hasReport)
        return { class: "provavel_direito", rationale: "Possui carência (12 meses), incapacidade e laudo médico." };
      if (contribMonths >= 12 && !hasReport)
        return { class: "precisa_avaliacao", rationale: "Tem carência, mas sem laudo médico. Precisa de avaliação médica (perícia INSS)." };
      if (contribMonths < 12)
        return { class: "precisa_avaliacao", rationale: `Faltam ${12 - contribMonths} meses de carência (salvo doença do trabalho/acidente).` };
      return { class: "precisa_avaliacao", rationale: "Situação precisa de análise detalhada." };
    }
  },

  salario_maternidade: {
    label: "Salário-maternidade",
    questions: [
      { id: "contrib_months", label: "Quantos meses de contribuição você tem?", type: "number", unit: "meses", required: true },
      { id: "situation", label: "Qual sua situação?", type: "choice", options: ["gravida", "ja_nasceu", "adocao"], required: true }
    ],
    evaluate(answers) {
      const contribMonths = Number(answers.contrib_months);
      if (contribMonths >= 10)
        return { class: "provavel_direito", rationale: "Possui carência de 10 meses. Salário-maternidade aplicável." };
      if (contribMonths > 0)
        return { class: "precisa_avaliacao", rationale: `Faltam ${10 - contribMonths} meses de carência.` };
      return { class: "sem_direito", rationale: "Sem contribuições registradas." };
    }
  },

  pensao_morte: {
    label: "Pensão por morte",
    questions: [
      { id: "relationship", label: "Qual seu parentesco com o falecido?", type: "choice", options: ["conjuge", "filho_menor", "filho_maior", "pais", "irmaos"], required: true },
      { id: "deceased_contributed", label: "O falecido contribuía para o INSS?", type: "choice", options: ["sim", "nao", "nao_sei"], required: true }
    ],
    evaluate(answers) {
      if (answers.deceased_contributed === "nao")
        return { class: "sem_direito", rationale: "Pensão por morte exige que o falecido fosse segurado do INSS." };
      const eligible = ["conjuge", "filho_menor", "pais", "irmaos"];
      if (eligible.includes(answers.relationship))
        return { class: "provavel_direito", rationale: "Dependente de segurado do INSS — pensão por morte aplicável." };
      if (answers.relationship === "filho_maior")
        return { class: "precisa_avaliacao", rationale: "Filho maior de 21 anos só tem direito em casos específicos (incapacidade, universitário até 24). Precisa análise." };
      return { class: "precisa_avaliacao", rationale: "Situação precisa de análise detalhada." };
    }
  },

  bpc_loas: {
    label: "BPC / LOAS",
    questions: [
      { id: "age", label: "Qual sua idade?", type: "number", unit: "anos", required: true },
      { id: "incapacity", label: "Você tem deficiência que limita a vida independente e o trabalho?", type: "choice", options: ["sim", "nao"], required: true },
      { id: "family_members", label: "Quantas pessoas moram na sua casa, incluindo você?", type: "number", unit: "pessoas", required: true },
      { id: "family_income", label: "A renda familiar é de até 1/4 do salário-mínimo por pessoa?", type: "choice", options: ["sim", "nao", "nao_sei"], required: true }
    ],
    evaluate(answers) {
      const age = Number(answers.age);
      const hasDeficiency = answers.incapacity === "sim";
      const lowIncome = answers.family_income === "sim";
      const familyMembers = Number(answers.family_members) || null;
      const familyNote = familyMembers ? ` (grupo familiar informado: ${familyMembers} pessoa(s))` : "";
      if (age >= 65 && lowIncome)
        return { class: "provavel_direito", rationale: `Idoso 65+ com renda familiar dentro do limite — BPC/LOAS aplicável.${familyNote}` };
      if (hasDeficiency && lowIncome)
        return { class: "provavel_direito", rationale: `Pessoa com deficiência e renda familiar dentro do limite — BPC/LOAS aplicável.${familyNote}` };
      if ((age >= 65 || hasDeficiency) && answers.family_income === "nao_sei")
        return { class: "precisa_avaliacao", rationale: `Atende ao critério pessoal, mas a renda familiar precisa ser verificada.${familyNote}` };
      if (!lowIncome && answers.family_income === "nao")
        return { class: "precisa_avaliacao", rationale: `Renda per capita pode estar acima do limite padrão (1/4 do salário-mínimo), mas há possibilidade de manutenção/concessão por vulnerabilidade se a renda por pessoa ficar até 1/2 do salário-mínimo, ou por decisão judicial. Precisa calcular a renda per capita exata e avaliar com a equipe jurídica.${familyNote}` };
      if (age < 65 && !hasDeficiency)
        return { class: "sem_direito", rationale: "BPC exige 65+ ou deficiência. Não atende nenhum critério pessoal." };
      return { class: "precisa_avaliacao", rationale: `Situação precisa de análise detalhada.${familyNote}` };
    }
  },

  trabalhista: {
    label: "Rescisão e direitos trabalhistas",
    questions: [
      { id: "situation", label: "Qual sua situação?", type: "choice", options: ["demissao_sem_justa", "demissao_justa", "rescisao_indireta", "acordo", "ainda_trabalhando"], required: true },
      { id: "worked_months", label: "Quanto tempo trabalhou lá (meses)?", type: "number", unit: "meses", required: true },
      { id: "received_verbas", label: "Recebeu as verbas rescisórias corretamente?", type: "choice", options: ["sim", "nao", "nao_sei"], required: true }
    ],
    evaluate(answers) {
      const months = Number(answers.worked_months);
      const notPaid = answers.received_verbas === "nao";
      if (answers.situation === "demissao_sem_justa" && notPaid && months > 0)
        return { class: "provavel_direito", rationale: "Demissão sem justa causa sem pagamento de verbas — provável direito a cobrança." };
      if (answers.situation === "rescisao_indireta" && months > 0)
        return { class: "precisa_avaliacao", rationale: "Rescisão indireta exige comprovação de falta grave do empregador. Precisa análise." };
      if (answers.received_verbas === "sim")
        return { class: "precisa_avaliacao", rationale: "Verbas pagas — pode haver diferenças a revisar. Precisa análise dos valores." };
      if (answers.situation === "ainda_trabalhando")
        return { class: "precisa_avaliacao", rationale: "Emprego ativo — pode haver verbas vencidas a verificar." };
      return { class: "precisa_avaliacao", rationale: "Situação trabalhista precisa de análise detalhada." };
    }
  },

  revisao: {
    label: "Revisão de benefício",
    questions: [
      { id: "benefit_type", label: "Qual benefício você recebe hoje?", type: "text", required: true },
      { id: "years_receiving", label: "Há quantos anos recebe?", type: "number", unit: "anos", required: true },
      { id: "months_receiving", label: "E quantos meses (além dos anos acima)?", type: "number", unit: "meses", required: false },
      { id: "issue", label: "Qual o motivo da revisão?", type: "choice", options: ["valor_baixo", "erro_calculo", "mudanca_legislacao", "outro"], required: true }
    ],
    evaluate(answers) {
      const years = Number(answers.years_receiving) || 0;
      const months = Number(answers.months_receiving) || 0;
      const totalYears = years + (months / 12);

      if (totalYears > 10)
        return { class: "precisa_avaliacao", rationale: `Recebe há ${years} ano(s) e ${months} mes(es) — mais de 10 anos. Pode haver limite, mas algumas revisões ainda cabem. Precisa análise.` };
      if (answers.issue === "mudanca_legislacao")
        return { class: "provavel_direito", rationale: "Mudança de legislação pode garantir revisão retroativa." };
      if (answers.issue === "erro_calculo" || answers.issue === "valor_baixo")
        return { class: "precisa_avaliacao", rationale: "Possível erro de cálculo — precisa análise da RMI e contribuições." };
      return { class: "precisa_avaliacao", rationale: "Motivo da revisão precisa de análise detalhada." };
    }
  }
};

function getBenefitConfig(benefitType) {
  return BENEFITS[benefitType] || null;
}

function getAllBenefits() {
  return Object.entries(BENEFITS).map(([key, config]) => ({
    key,
    label: config.label,
    questions: config.questions
  }));
}

function runTriagem(benefitType, answers) {
  const config = BENEFITS[benefitType];
  if (!config)
    return { class: "precisa_avaliacao", rationale: "Tipo de benefício não reconhecido." };
  return config.evaluate(answers);
}

const CLASSIFICATION_LABELS = {
  provavel_direito: "Provável direito",
  precisa_avaliacao: "Precisa avaliação",
  sem_direito: "Sem direito no momento"
};

const STATUS_LABELS = {
  novo: "Novo",
  contatado: "Contatado",
  em_andamento: "Em andamento",
  fechado: "Fechado",
  descartado: "Descartado"
};

export { getBenefitConfig, getAllBenefits, runTriagem, CLASSIFICATION_LABELS, STATUS_LABELS, ROUTER_QUESTION, CAMPO_LIVRE_OPCIONAL, resolveBenefitKey };
