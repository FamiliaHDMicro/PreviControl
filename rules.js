// PrevControl — Motor de regras determinístico
// Resultado: provavel_direito | precisa_avaliacao | sem_direito

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

const CAMPO_LIVRE_OPCIONAL = {
  id: "observacao_livre",
  label: "Quer contar mais alguma coisa? (opcional)",
  type: "text",
  required: false
};

function resolveBenefitKey(routerValue) {
  if (routerValue === "bpc_loas_renovacao") return "bpc_loas";
  return routerValue;
}

const BENEFITS = {
  aposentadoria_idade: {
    label: "Aposentadoria por idade",
    questions: [
      { id: "age", label: "Qual a sua idade?", type: "number", unit: "anos", required: true },
      { id: "contrib_years", label: "Quantos anos você já contribuiu para o INSS?", type: "number", unit: "anos", required: true },
      { id: "contrib_months", label: "E quantos meses a mais (além dos anos)?", type: "number", unit: "meses", required: false },
      { id: "gender", label: "Você é homem ou mulher?", type: "choice", options: ["homem", "mulher"], required: true }
    ],
    evaluate(answers) {
      const age = Number(answers.age);
      const cy = Number(answers.contrib_years) || 0;
      const cm = Number(answers.contrib_months) || 0;
      const contrib = cy + (cm / 12);
      const isMale = answers.gender === "homem";
      if (!age || !cy) return { class: "precisa_avaliacao", rationale: "Precisamos da sua idade e do tempo de contribuição para avaliar." };
      const minAge = isMale ? 65 : 62;
      const minContrib = 15;
      if (age >= minAge && contrib >= minContrib)
        return { class: "provavel_direito", rationale: `Ótima notícia! Você atende a idade mínima (${minAge} anos) e o tempo de contribuição (${cy} anos e ${cm} meses).` };
      const extra = contrib - minContrib;
      if (extra > 0 && age >= minAge - extra * 0.5)
        return { class: "provavel_direito", rationale: "Pode se encaixar na regra de transição, pois você tem mais tempo de contribuição que o mínimo." };
      if (age >= minAge - 2 && contrib >= minContrib)
        return { class: "precisa_avaliacao", rationale: "Você está bem pertinho da idade mínima. Vale a pena analisar com calma." };
      return { class: "sem_direito", rationale: `Ainda faltam ${Math.max(minAge - age, 0)} anos de idade ou mais tempo de contribuição. Mas fique tranquilo(a), podemos te orientar.` };
    }
  },
  aposentadoria_tempo: {
    label: "Aposentadoria por tempo de contribuição",
    questions: [
      { id: "contrib_years", label: "Quantos anos você já contribuiu para o INSS?", type: "number", unit: "anos", required: true },
      { id: "gender", label: "Você é homem ou mulher?", type: "choice", options: ["homem", "mulher"], required: true },
      { id: "started_before_2019", label: "Você já contribuía antes de novembro de 2019?", type: "choice", options: ["sim", "nao"], required: true }
    ],
    evaluate(answers) {
      const contrib = Number(answers.contrib_years);
      const isMale = answers.gender === "homem";
      const before = answers.started_before_2019 === "sim";
      const target = isMale ? 35 : 30;
      if (!contrib) return { class: "precisa_avaliacao", rationale: "Precisamos saber seu tempo de contribuição." };
      if (contrib >= target && before)
        return { class: "provavel_direito", rationale: `Ótima notícia! Você tem ${contrib} anos (mínimo ${target}) e já contribuía antes da Reforma de 2019.` };
      if (contrib >= target - 2 && before)
        return { class: "precisa_avaliacao", rationale: `Faltam poucos anos (${target - contrib}). Com o pedágio da regra de transição, pode haver direito.` };
      if (!before)
        return { class: "sem_direito", rationale: "A aposentadoria por tempo puro acabou na Reforma de 2019. Mas existem outras regras de transição que podemos analisar." };
      return { class: "sem_direito", rationale: `Faltam ${target - contrib} anos de contribuição.` };
    }
  },
  auxilio_doenca: {
    label: "Auxílio-doença",
    questions: [
      { id: "contrib_months", label: "Quantos meses você já contribuiu para o INSS?", type: "number", unit: "meses", required: true },
      { id: "incapacity", label: "Você está impossibilitado(a) de trabalhar por motivo de saúde?", type: "choice", options: ["sim", "nao"], required: true },
      { id: "has_medical_report", label: "Você tem laudo médico ou atestado?", type: "choice", options: ["sim", "nao"], required: true }
    ],
    evaluate(answers) {
      const cm = Number(answers.contrib_months);
      if (answers.incapacity !== "sim") return { class: "sem_direito", rationale: "O auxílio-doença exige que a pessoa esteja impossibilitada de trabalhar." };
      if (cm >= 12 && answers.has_medical_report === "sim")
        return { class: "provavel_direito", rationale: "Você tem a carência necessária (12 meses), está incapacitado(a) e tem laudo médico. Ótimo!" };
      if (cm >= 12)
        return { class: "precisa_avaliacao", rationale: "Você tem a carência, mas vai precisar de laudo médico para a perícia do INSS." };
      return { class: "precisa_avaliacao", rationale: `Faltam ${12 - cm} meses de carência (salvo se for doença do trabalho ou acidente).` };
    }
  },
  salario_maternidade: {
    label: "Salário-maternidade",
    questions: [
      { id: "contrib_months", label: "Quantos meses você já contribuiu para o INSS?", type: "number", unit: "meses", required: true },
      { id: "situation", label: "Qual a sua situação?", type: "choice", options: ["gravida", "ja_nasceu", "adocao"], required: true }
    ],
    evaluate(answers) {
      const cm = Number(answers.contrib_months);
      if (cm >= 10) return { class: "provavel_direito", rationale: "Parabéns! Você tem a carência de 10 meses necessária para o salário-maternidade." };
      if (cm > 0) return { class: "precisa_avaliacao", rationale: `Faltam ${10 - cm} meses de carência. Mas fique tranquilo(a), podemos te orientar.` };
      return { class: "sem_direito", rationale: "Sem contribuições registradas. Mas existem situações especiais — vale a pena conversar." };
    }
  },
  pensao_morte: {
    label: "Pensão por morte",
    questions: [
      { id: "relationship", label: "Qual seu parentesco com a pessoa falecida?", type: "choice", options: ["conjuge", "filho_menor", "filho_maior", "pais", "irmaos"], required: true },
      { id: "deceased_contributed", label: "A pessoa falecida contribuía para o INSS?", type: "choice", options: ["sim", "nao", "nao_sei"], required: true }
    ],
    evaluate(answers) {
      if (answers.deceased_contributed === "nao")
        return { class: "sem_direito", rationale: "A pensão por morte exige que a pessoa falecida fosse segurada do INSS. Mas podemos analisar seu caso com calma." };
      if (["conjuge", "filho_menor", "pais", "irmaos"].includes(answers.relationship))
        return { class: "provavel_direito", rationale: "Como dependente de segurado do INSS, você provavelmente tem direito à pensão por morte." };
      if (answers.relationship === "filho_maior")
        return { class: "precisa_avaliacao", rationale: "Filho maior de 21 anos só tem direito em casos específicos (incapacidade ou universitário até 24). Vamos analisar." };
      return { class: "precisa_avaliacao", rationale: "Situação precisa de análise detalhada." };
    }
  },
  bpc_loas: {
    label: "BPC / LOAS",
    questions: [
      { id: "age", label: "Qual a sua idade?", type: "number", unit: "anos", required: true },
      { id: "incapacity", label: "Você tem alguma deficiência que limita sua vida e seu trabalho?", type: "choice", options: ["sim", "nao"], required: true },
      { id: "family_members", label: "Quantas pessoas moram na sua casa, incluindo você?", type: "number", unit: "pessoas", required: true },
      { id: "family_income", label: "A renda da família é de até 1/4 do salário-mínimo por pessoa?", type: "choice", options: ["sim", "nao", "nao_sei"], required: true }
    ],
    evaluate(answers) {
      const age = Number(answers.age);
      const hasDef = answers.incapacity === "sim";
      const lowIncome = answers.family_income === "sim";
      const fm = Number(answers.family_members) || null;
      const note = fm ? ` (grupo familiar: ${fm} pessoa(s))` : "";
      if (age >= 65 && lowIncome)
        return { class: "provavel_direito", rationale: `Ótima notícia! Idoso(a) com 65+ e renda familiar dentro do limite — BPC/LOAS aplicável.${note}` };
      if (hasDef && lowIncome)
        return { class: "provavel_direito", rationale: `Pessoa com deficiência e renda familiar dentro do limite — BPC/LOAS aplicável.${note}` };
      if ((age >= 65 || hasDef) && answers.family_income === "nao_sei")
        return { class: "precisa_avaliacao", rationale: `Você atende ao critério pessoal, mas precisamos verificar a renda familiar.${note}` };
      if (!lowIncome && answers.family_income === "nao")
        return { class: "precisa_avaliacao", rationale: `A renda pode estar acima do limite padrão, mas existe possibilidade de concessão por vulnerabilidade. Vamos calcular direitinho.${note}` };
      if (age < 65 && !hasDef)
        return { class: "sem_direito", rationale: "O BPC exige 65+ ou deficiência. Mas podemos te orientar sobre outros benefícios." };
      return { class: "precisa_avaliacao", rationale: `Situação precisa de análise detalhada.${note}` };
    }
  },
  trabalhista: {
    label: "Direitos trabalhistas",
    questions: [
      { id: "situation", label: "Qual a sua situação?", type: "choice", options: ["demissao_sem_justa", "demissao_justa", "rescisao_indireta", "acordo", "ainda_trabalhando"], required: true },
      { id: "worked_months", label: "Quanto tempo você trabalhou lá (em meses)?", type: "number", unit: "meses", required: true },
      { id: "received_verbas", label: "Recebeu as verbas rescisórias corretamente?", type: "choice", options: ["sim", "nao", "nao_sei"], required: true }
    ],
    evaluate(answers) {
      const m = Number(answers.worked_months);
      if (answers.situation === "demissao_sem_justa" && answers.received_verbas === "nao" && m > 0)
        return { class: "provavel_direito", rationale: "Demissão sem justa causa sem pagamento de verbas — provável direito a cobrança." };
      if (answers.situation === "rescisao_indireta" && m > 0)
        return { class: "precisa_avaliacao", rationale: "Rescisão indireta exige comprovação de falta grave do empregador. Vamos analisar." };
      if (answers.received_verbas === "sim")
        return { class: "precisa_avaliacao", rationale: "Verbas pagas — pode haver diferenças a revisar. Vale a pena conferir." };
      if (answers.situation === "ainda_trabalhando")
        return { class: "precisa_avaliacao", rationale: "Emprego ativo — pode haver verbas vencidas a verificar." };
      return { class: "precisa_avaliacao", rationale: "Situação trabalhista precisa de análise detalhada." };
    }
  },
  revisao: {
    label: "Revisão de benefício",
    questions: [
      { id: "benefit_type", label: "Qual benefício você recebe hoje?", type: "text", required: true },
      { id: "years_receiving", label: "Há quantos anos você recebe?", type: "number", unit: "anos", required: true },
      { id: "months_receiving", label: "E quantos meses a mais (além dos anos)?", type: "number", unit: "meses", required: false },
      { id: "issue", label: "Qual o motivo da revisão?", type: "choice", options: ["valor_baixo", "erro_calculo", "mudanca_legislacao", "outro"], required: true }
    ],
    evaluate(answers) {
      const y = Number(answers.years_receiving) || 0;
      const m = Number(answers.months_receiving) || 0;
      const total = y + (m / 12);
      if (total > 10)
        return { class: "precisa_avaliacao", rationale: `Você recebe há ${y} ano(s) e ${m} mes(es). Pode haver limite, mas algumas revisões ainda cabem. Vamos analisar.` };
      if (answers.issue === "mudanca_legislacao")
        return { class: "provavel_direito", rationale: "Mudança de legislação pode garantir revisão retroativa. Ótimo!" };
      if (answers.issue === "erro_calculo" || answers.issue === "valor_baixo")
        return { class: "precisa_avaliacao", rationale: "Possível erro de cálculo — precisa análise da RMI e das contribuições." };
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

export {
  getBenefitConfig, getAllBenefits, runTriagem,
  CLASSIFICATION_LABELS, ROUTER_QUESTION, CAMPO_LIVRE_OPCIONAL,
  resolveBenefitKey
};
