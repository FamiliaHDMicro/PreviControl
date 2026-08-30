// index.js — PrevControl Worker (Terminal Burro / Single File)
// Custo zero · Sem IA · Sem juridiquês · Respeito com 50+
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

    if (path === "/api/admin/login" && request.method === "POST") {
      return handleLogin(request, env, corsHeaders);
    }

    if (path === "/api/leads" && request.method === "POST") {
      return handleLeads(request, env, corsHeaders);
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

    const html = renderHTML(env.WHATSAPP_NUMBER || "5517991087449");
    return new Response(html, {
      headers: { "Content-Type": "text/html;charset=UTF-8", ...corsHeaders }
    });
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
      ok: true,
      resumo,
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

function renderHTML(WHATSAPP_NUMBER) {
  const routerData = JSON.stringify(ROUTER_QUESTION);
  const benefitsData = JSON.stringify(getAllBenefits());
  const campoLivreData = JSON.stringify(CAMPO_LIVRE_OPCIONAL);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PrevConsulta — Triagem Previdenciária</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  * { font-family: 'Inter', system-ui, sans-serif; }
  body { background: #0a1628; color: #e2e8f0; min-height: 100vh; }
  .grid-bg {
    background-image: linear-gradient(rgba(59,130,246,0.08) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(59,130,246,0.08) 1px, transparent 1px);
    background-size: 40px 40px;
  }
  .glow {
    background: radial-gradient(ellipse at 30% 20%, rgba(59,130,246,0.15) 0%, transparent 50%),
                radial-gradient(ellipse at 70% 80%, rgba(139,92,246,0.1) 0%, transparent 50%);
  }
  .fade-in { animation: fadeIn .4s ease both; }
  @keyframes fadeIn { from { opacity:0; transform:translateY(10px);} to {opacity:1; transform:translateY(0);} }
  .step-dot { transition: all .3s ease; }
  .step-dot.active { background:#3b82f6; border-color:#3b82f6; color:#fff; }
  .step-dot.done { background:#10b981; border-color:#10b981; color:#fff; }
  .step-dot.pending { background:transparent; border-color:rgba(148,163,184,.3); color:#64748b; }
  .step-line { background: rgba(148,163,184,.2); }
  .step-line.done { background: #10b981; }
  input:focus, select:focus, textarea:focus { outline:none; border-color:#3b82f6 !important; box-shadow:0 0 0 4px rgba(59,130,246,.25); }
  .btn-primary { background:linear-gradient(135deg,#2563eb,#1d4ed8); transition: all .2s; }
  .btn-primary:hover { background:linear-gradient(135deg,#1d4ed8,#1e40af); transform:translateY(-1px); }
  .btn-ghost { background:rgba(30,41,59,.6); border:1px solid rgba(148,163,184,.2); transition: all .2s; }
  .btn-ghost:hover { background:rgba(30,41,59,.9); border-color:rgba(148,163,184,.4); }
  .option-btn { background:rgba(15,23,42,.6); border:1px solid rgba(59,130,246,.2); transition: all .2s; }
  .option-btn:hover { background:rgba(30,41,59,.8); border-color:#3b82f6; transform:translateX(4px); }
  .card { background:rgba(15,23,42,.7); border:1px solid rgba(59,130,246,.15); backdrop-filter:blur(10px); }
  .big-text { font-size: clamp(1rem, 2.5vw, 1.15rem); }
  .huge-text { font-size: clamp(2rem, 6vw, 3.5rem); line-height: 1.05; letter-spacing: -0.02em; }
  .input-big { font-size: 1.05rem; padding: 0.9rem 1rem; }
  .btn-big { font-size: 1.05rem; padding: 1rem 1.5rem; }
</style>
</head>
<body class="grid-bg glow">

<header class="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-6">
  <div class="flex items-center justify-between mb-8">
    <div class="flex items-center gap-2">
      <div class="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center font-bold text-white">P</div>
      <span class="font-bold text-white text-lg">PrevConsulta</span>
    </div>
    <button onclick="abrirLoginModal()" class="text-sm text-slate-400 hover:text-blue-400">Área Restrita →</button>
  </div>
  <div class="grid md:grid-cols-12 gap-8 items-end">
    <div class="md:col-span-7">
      <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-semibold mb-6">
        <span class="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
        TRIAGEM PREVIDENCIÁRIA · GRATUITA
      </div>
      <h1 class="huge-text font-bold text-white mb-4">
        Descubra se você tem<br><span class="text-blue-400">direito ao seu benefício</span>
      </h1>
      <p class="big-text text-slate-300 max-w-xl">
        Responda algumas perguntas simples. É rápido, sem complicação e sem juridiquês.
      </p>
    </div>
    <div class="md:col-span-5 hidden md:block">
      <div class="card rounded-2xl p-5 space-y-3">
        <div class="text-xs font-mono text-blue-400 uppercase tracking-wider">Como funciona</div>
        <div class="space-y-2.5">
          <div class="flex gap-3 items-start">
            <div class="w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center text-xs font-bold shrink-0">1</div>
            <div class="text-sm text-slate-300">Conte sua situação</div>
          </div>
          <div class="flex gap-3 items-start">
            <div class="w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center text-xs font-bold shrink-0">2</div>
            <div class="text-sm text-slate-300">Receba uma análise inicial</div>
          </div>
          <div class="flex gap-3 items-start">
            <div class="w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center text-xs font-bold shrink-0">3</div>
            <div class="text-sm text-slate-300">Envie pelo WhatsApp</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</header>

<main class="max-w-3xl mx-auto px-4 sm:px-6 pb-16">
  <div class="card rounded-2xl p-5 sm:p-8">
    <div id="stepper" class="flex items-center mb-6"></div>
    <div id="form-area" class="fade-in"></div>
  </div>
  <div class="mt-6 text-center text-xs text-slate-500 px-4">
    💡 Esta é uma análise inicial e automática. Não substitui uma consulta com advogado.
  </div>
</main>

<div id="modal-login" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center hidden p-3">
  <div class="card rounded-2xl w-full max-w-[320px] p-5 space-y-3">
    <div class="flex justify-between items-center border-b border-blue-900/40 pb-3">
      <h3 class="text-base font-bold text-white">Acesso ao Painel</h3>
      <button onclick="fecharLoginModal()" class="text-slate-400 hover:text-white text-xl">✕</button>
    </div>
    <div>
      <label class="block text-xs font-mono text-slate-300 mb-1">Usuário</label>
      <input type="text" id="user-login" class="w-full bg-[#0a1628] border border-blue-800/50 rounded-lg p-2.5 text-white text-sm">
    </div>
    <div>
      <label class="block text-xs font-mono text-slate-300 mb-1">Senha</label>
      <input type="password" id="pass-login" class="w-full bg-[#0a1628] border border-blue-800/50 rounded-lg p-2.5 text-white text-sm">
    </div>
    <div class="flex gap-2">
      <button onclick="autenticarUsuario()" class="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-lg font-bold text-sm">Entrar</button>
      <button onclick="fecharLoginModal()" class="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-lg font-bold text-sm">Cancelar</button>
    </div>
  </div>
</div>

<div id="modal-painel" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center hidden p-3">
  <div class="card rounded-2xl w-full max-w-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto">
    <div class="flex justify-between items-center border-b border-blue-900/40 pb-3">
      <div>
        <span class="text-blue-400 text-xs font-mono">// GESTÃO DE ATENDIMENTOS</span>
        <h3 class="text-lg font-bold text-white">Painel <span id="user-badge" class="text-xs font-normal text-slate-400"></span></h3>
      </div>
      <button onclick="fecharPainel()" class="text-slate-400 hover:text-white font-bold text-xl">✕</button>
    </div>
    <div id="leads-lista" class="space-y-2 text-sm text-slate-300">Carregando leads...</div>
  </div>
</div>

<script>
const DEFAULT_PHONE = "${WHATSAPP_NUMBER}";
const ROUTER = ${routerData};
const BENEFITS = ${benefitsData};
const CAMPO_LIVRE = ${campoLivreData};

const estado = {
  step: 'contato',
  nome: '', telefone: '', routerValue: null, benefitKey: null,
  questions: [], qIndex: 0, answers: {}, observacao: ''
};

function mascaraTelefone(valor) {
  const d = valor.replace(/\\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? \`(\${d}\` : '';
  if (d.length <= 7) return \`(\${d.slice(0,2)}) \${d.slice(2)}\`;
  return \`(\${d.slice(0,2)}) \${d.slice(2,7)}-\${d.slice(7,11)}\`;
}

function aplicarMascara(input) {
  input.addEventListener('input', (e) => {
    const pos = e.target.selectionStart;
    const antes = e.target.value.length;
    e.target.value = mascaraTelefone(e.target.value);
    const depois = e.target.value.length;
    e.target.setSelectionRange(pos + (depois - antes), pos + (depois - antes));
  });
}

function renderStepper() {
  const labels = ['Seus dados', 'Situação', 'Perguntas', 'Finalizar'];
  const el = document.getElementById('stepper');
  const stepMap = { contato: 0, router: 1, perguntas: 2, observacao: 3, sucesso: 4 };
  const atual = stepMap[estado.step] ?? 0;
  el.innerHTML = labels.map((l, i) => {
    let cls = 'step-dot w-8 h-8 sm:w-9 sm:h-9 rounded-full border-2 flex items-center justify-center text-xs sm:text-sm font-bold shrink-0 ';
    if (i < atual) cls += 'done';
    else if (i === atual) cls += 'active';
    else cls += 'pending';
    const line = i < labels.length - 1 ? \`<div class="flex-1 h-0.5 mx-1 sm:mx-2 step-line \${i < atual ? 'done' : ''}"></div>\` : '';
    return \`<div class="flex items-center flex-1">
      <div class="flex flex-col items-center gap-1.5">
        <div class="\${cls}">\${i < atual ? '✓' : (i+1)}</div>
        <div class="text-[10px] sm:text-xs text-slate-400 font-medium text-center">\${l}</div>
      </div>
      \${line}
    </div>\`;
  }).join('');
}

function inputBase() {
  return 'w-full bg-[#0a1628] border border-blue-800/50 rounded-lg input-big text-white';
}

function render() {
  renderStepper();
  const area = document.getElementById('form-area');
  area.classList.remove('fade-in');
  void area.offsetWidth;
  area.classList.add('fade-in');

  if (estado.step === 'contato') {
    area.innerHTML = \`
      <div class="space-y-5">
        <div class="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-sm text-slate-200">
           Olá! Que bom ter você aqui. Vamos fazer uma análise rápida e sem complicação do seu benefício.
        </div>
        <div>
          <label class="block text-sm font-semibold text-slate-200 mb-2">Seu nome completo</label>
          <input id="i-nome" class="\${inputBase()}" placeholder="Como podemos te chamar?" value="\${estado.nome}" maxlength="60">
        </div>
        <div>
          <label class="block text-sm font-semibold text-slate-200 mb-2">WhatsApp (com DDD)</label>
          <input id="i-telefone" class="\${inputBase()}" placeholder="(17) 99999-9999" value="\${estado.telefone}" maxlength="15">
        </div>
        <div id="erro-contato" class="text-sm text-red-400 hidden"></div>
        <button onclick="avancarContato()" class="w-full btn-primary text-white font-bold btn-big rounded-lg">Continuar →</button>
      </div>\`;
    const tel = document.getElementById('i-telefone');
    if (tel) aplicarMascara(tel);
    return;
  }

  if (estado.step === 'router') {
    area.innerHTML = \`
      <div class="space-y-4">
        <div>
          <div class="text-xs text-blue-400 font-mono uppercase tracking-wider mb-2">Etapa 2 de 4</div>
          <label class="block text-lg sm:text-xl font-bold text-white mb-1">\${ROUTER.label}</label>
          <p class="text-sm text-slate-400">Escolha a opção que mais se parece com a sua situação.</p>
        </div>
        <div class="space-y-2.5">
          \${ROUTER.options.map(o => \`
            <button onclick='escolherRouter(\${JSON.stringify(o.value)})' class="option-btn w-full text-left rounded-xl p-4 text-sm sm:text-base text-white font-medium">
              \${o.label}
            </button>
          \`).join('')}
        </div>
        <button onclick="voltar()" class="w-full btn-ghost text-white font-semibold py-3 rounded-lg text-sm">← Voltar</button>
      </div>\`;
    return;
  }

  if (estado.step === 'perguntas') {
    const q = estado.questions[estado.qIndex];
    let campo = '';
    if (q.type === 'choice') {
      campo = \`<select id="i-resp" class="\${inputBase()}">\${q.options.map(op => \`<option value="\${op}">\${op}</option>\`).join('')}</select>\`;
    } else if (q.type === 'number') {
      campo = \`<input id="i-resp" type="number" class="\${inputBase()}" placeholder="\${q.unit || ''}" min="0">\`;
    } else {
      campo = \`<input id="i-resp" type="text" class="\${inputBase()}" placeholder="Sua resposta">\`;
    }
    area.innerHTML = \`
      <div class="space-y-5">
        <div>
          <div class="text-xs text-blue-400 font-mono uppercase tracking-wider mb-2">Etapa 3 de 4 · Pergunta \${estado.qIndex + 1} de \${estado.questions.length}</div>
          <label class="block text-lg sm:text-xl font-bold text-white mb-1">\${q.label}</label>
        </div>
        \${campo}
        <div id="erro-pergunta" class="text-sm text-red-400 hidden"></div>
        <div class="flex gap-3">
          <button onclick="voltar()" class="flex-1 btn-ghost text-white font-semibold py-3 rounded-lg">← Voltar</button>
          <button onclick="responderPergunta()" class="flex-[2] btn-primary text-white font-bold btn-big rounded-lg">\${estado.qIndex + 1 < estado.questions.length ? 'Próxima →' : 'Continuar →'}</button>
        </div>
      </div>\`;
    return;
  }

  if (estado.step === 'observacao') {
    area.innerHTML = \`
      <div class="space-y-5">
        <div>
          <div class="text-xs text-blue-400 font-mono uppercase tracking-wider mb-2">Etapa 4 de 4</div>
          <label class="block text-lg sm:text-xl font-bold text-white mb-1">\${CAMPO_LIVRE.label}</label>
        </div>
        <textarea id="i-obs" class="\${inputBase()} h-28 resize-none" placeholder="Conte o que quiser... ou pule esta etapa."></textarea>
        <div class="flex gap-3">
          <button onclick="voltar()" class="flex-1 btn-ghost text-white font-semibold py-3 rounded-lg">← Voltar</button>
          <button onclick="finalizar()" class="flex-[2] btn-primary text-white font-bold btn-big rounded-lg">Gerar análise </button>
        </div>
      </div>\`;
    return;
  }

  if (estado.step === 'sucesso') {
    area.innerHTML = estado.sucessoHTML;
    return;
  }
}

function avancarContato() {
  const nome = document.getElementById('i-nome').value.trim();
  const tel = document.getElementById('i-telefone').value.trim();
  const err = document.getElementById('erro-contato');
  if (!nome || nome.length < 3) {
    err.textContent = 'Por favor, digite seu nome completo.'; err.classList.remove('hidden'); return;
  }
  if (tel.replace(/\\D/g,'').length < 10) {
    err.textContent = 'Por favor, digite um WhatsApp válido com DDD.'; err.classList.remove('hidden'); return;
  }
  estado.nome = nome;
  estado.telefone = tel;
  estado.step = 'router';
  render();
}

function escolherRouter(value) {
  estado.routerValue = value;
  const key = value === 'bpc_loas_renovacao' ? 'bpc_loas' : value;
  const benefit = BENEFITS.find(b => b.key === key);
  estado.benefitKey = key;
  estado.questions = benefit ? benefit.questions : [];
  estado.qIndex = 0;
  estado.answers = {};
  estado.step = estado.questions.length ? 'perguntas' : 'observacao';
  render();
}

function responderPergunta() {
  const q = estado.questions[estado.qIndex];
  const val = document.getElementById('i-resp').value;
  const err = document.getElementById('erro-pergunta');
  if (q.required && !val) {
    err.textContent = 'Essa pergunta é importante. Por favor, responda.'; err.classList.remove('hidden'); return;
  }
  estado.answers[q.id] = val;
  if (estado.qIndex + 1 < estado.questions.length) {
    estado.qIndex++;
  } else {
    estado.step = 'observacao';
  }
  render();
}

function voltar() {
  if (estado.step === 'router') estado.step = 'contato';
  else if (estado.step === 'perguntas') {
    if (estado.qIndex > 0) { estado.qIndex--; render(); return; }
    else estado.step = 'router';
  }
  else if (estado.step === 'observacao') estado.step = 'perguntas';
  render();
}

async function finalizar() {
  estado.observacao = document.getElementById('i-obs').value.trim();
  const area = document.getElementById('form-area');
  area.innerHTML = \`<div class="text-center py-10 space-y-4">
    <div class="inline-block w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
    <p class="text-slate-300 text-lg">Enviando sua análise... aguarde um instante.</p>
  </div>\`;

  try {
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: estado.nome, telefone: estado.telefone,
        routerValue: estado.routerValue, answers: estado.answers,
        observacao: estado.observacao
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Erro ao salvar');

    const classLabel = data.classification_label;
    const resumo = data.resumo;
    const rationale = data.rationale;
    const classColor = data.classification === 'provavel_direito' ? 'text-emerald-400' :
                       data.classification === 'precisa_avaliacao' ? 'text-amber-400' : 'text-slate-400';
    const classBg = data.classification === 'provavel_direito' ? 'bg-emerald-500/10 border-emerald-500/30' :
                    data.classification === 'precisa_avaliacao' ? 'bg-amber-500/10 border-amber-500/30' : 'bg-slate-500/10 border-slate-500/30';

    estado.sucessoHTML = \`
      <div class="text-center space-y-5">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/20 text-3xl">🎉</div>
        <div>
          <h3 class="text-2xl sm:text-3xl font-bold text-white mb-2">Obrigado, \${estado.nome.split(' ')[0]}!</h3>
          <p class="text-slate-300 text-base">Sua análise foi enviada com sucesso.</p>
        </div>
        <div class="\${classBg} border rounded-xl p-5 text-left space-y-2">
          <div class="text-xs text-slate-400 uppercase font-semibold">Resultado da triagem</div>
          <div class="text-xl font-bold \${classColor}">\${classLabel}</div>
          <div class="text-sm text-slate-200 pt-3 border-t border-white/10 leading-relaxed">\${rationale}</div>
        </div>
        <div class="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-sm text-slate-300 text-left">
          💡 <strong class="text-white">Importante:</strong> este é um resultado inicial e automático. Não substitui uma análise completa.
        </div>
        <div class="space-y-3 pt-2">
          <a href="https://wa.me/\${DEFAULT_PHONE}?text=\${encodeURIComponent(resumo)}" target="_blank" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold btn-big rounded-lg flex items-center justify-center gap-2">
             Enviar resumo no WhatsApp
          </a>
          <button onclick="reiniciar()" class="w-full btn-ghost text-white font-semibold py-3 rounded-lg">
            Fazer nova análise
          </button>
        </div>
      </div>\`;

    estado.step = 'sucesso';
    render();
  } catch (e) {
    area.innerHTML = \`<div class="text-center py-10 space-y-4">
      <div class="text-5xl">😔</div>
      <p class="text-red-400 text-lg">Não conseguimos enviar sua análise.</p>
      <button onclick="render()" class="w-full btn-primary text-white font-bold btn-big rounded-lg">Tentar novamente</button>
    </div>\`;
  }
}

function reiniciar() {
  estado.step = 'contato';
  estado.nome = ''; estado.telefone = ''; estado.routerValue = null;
  estado.benefitKey = null; estado.questions = []; estado.qIndex = 0;
  estado.answers = {}; estado.observacao = '';
  render();
}

let authToken = null;

function abrirLoginModal() { document.getElementById('modal-login').classList.remove('hidden'); }
function fecharLoginModal() { document.getElementById('modal-login').classList.add('hidden'); }
function fecharPainel() { document.getElementById('modal-painel').classList.add('hidden'); }

async function autenticarUsuario() {
  const u = document.getElementById('user-login').value.trim();
  const p = document.getElementById('pass-login').value;
  if (!u || !p) { alert('Preencha usuário e senha.'); return; }
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: p })
    });
    if (res.ok) {
      const data = await res.json();
      authToken = p;
      fecharLoginModal();
      document.getElementById('user-badge').innerText = '(' + data.role + ')';
      document.getElementById('modal-painel').classList.remove('hidden');
      carregarLeads();
    } else {
      alert('Usuário ou senha incorretos!');
    }
  } catch (e) {
    alert('Erro ao conectar com o servidor.');
  }
}

async function carregarLeads() {
  const container = document.getElementById('leads-lista');
  try {
    const res = await fetch('/api/admin/leads', { headers: { 'Authorization': 'Bearer ' + authToken } });
    const data = await res.json();
    if (!data.leads || data.leads.length === 0) {
      container.innerHTML = '<p class="text-slate-500 text-center py-4">Nenhum lead ainda.</p>';
      return;
    }
    container.innerHTML = data.leads.map(l => \`
      <div class="card rounded-lg p-4">
        <div class="flex justify-between text-xs text-slate-400 mb-1">
          <span>\${l.created_at ? new Date(l.created_at).toLocaleString('pt-BR') : ''}</span>
          <span class="text-blue-400 font-bold">\${l.classification || ''}</span>
        </div>
        <div class="font-bold text-white text-base">\${l.name} — \${l.phone}</div>
        <div class="text-xs text-slate-500">\${l.benefit_type || ''}</div>
        <div class="text-xs text-slate-400 mt-2 leading-relaxed">\${l.rationale || ''}</div>
      </div>\`).join('');
  } catch (e) {
    container.innerHTML = '<p class="text-red-400">Erro ao carregar leads.</p>';
  }
}

render();
</script>
</body>
</html>`;
}
