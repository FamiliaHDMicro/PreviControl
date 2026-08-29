// index.js — PrevControl / PrevConsulta (Terminal Burro / Single File, custo zero)
// v2: usa o roteador (Pergunta 0) + perguntas dinâmicas de cada benefício, vindas do rules.js

import {
  runTriagem,
  CLASSIFICATION_LABELS,
  getAllBenefits,
  getBenefitConfig,
  ROUTER_QUESTION,
  CAMPO_LIVRE_OPCIONAL,
  resolveBenefitKey
} from "./rules.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const DEFAULT_PHONE = "5517991087449";

    const USERS_DATABASE = [
      { user: "admin", pass: env.ADMIN_TOKEN || "admin7449", role: "Administrador (Cleiton)" },
      { user: "atendimento1", pass: env.USER1_TOKEN || "user123", role: "Atendente 01" },
      { user: "atendimento2", pass: env.USER2_TOKEN || "user1234", role: "Atendente 02" }
    ];

    if (path === "/api/admin/login" && request.method === "POST") {
      try {
        const body = await request.json();
        const foundUser = USERS_DATABASE.find(u => u.user === body.username && u.pass === body.password);
        if (!foundUser) return json({ error: "Usuário ou senha incorretos!" }, 401);
        return json({ ok: true, role: foundUser.role });
      } catch (e) {
        return json({ error: "Erro na requisição" }, 400);
      }
    }

    if (path === "/api/leads" && request.method === "POST") {
      try {
        const body = await request.json();
        const { nome, telefone, routerValue, answers, observacao } = body;

        if (!nome || !telefone || !routerValue) {
          return json({ ok: false, message: "Nome, telefone e situação são obrigatórios." }, 400);
        }

        const benefitKey = resolveBenefitKey(routerValue);
        const config = getBenefitConfig(benefitKey);
        if (!config) {
          return json({ ok: false, message: "Situação não reconhecida." }, 400);
        }

        const resultado = runTriagem(benefitKey, answers || {});
        const classificationLabel = CLASSIFICATION_LABELS[resultado.class] || resultado.class;

        const resumo = montarResumo({
          nome, telefone, benefitLabel: config.label, routerValue,
          answers, observacao, resultado, classificationLabel
        });

        if (env.DB) {
          await env.DB.prepare(
            `INSERT INTO leads (nome, telefone, resumo, classification, rationale, beneficio, data)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            nome, telefone, resumo, resultado.class, resultado.rationale, config.label, new Date().toISOString()
          ).run();
        }

        return json({
          ok: true, resumo, classification: resultado.class,
          classification_label: classificationLabel, rationale: resultado.rationale
        });
      } catch (e) {
        console.error("erro /api/leads:", e);
        return json({ ok: false, message: "Erro ao salvar: " + e.message }, 500);
      }
    }

    if (path === "/api/admin/leads" && request.method === "GET") {
      const auth = request.headers.get("Authorization") || "";
      const token = auth.replace("Bearer ", "");
      const authorized = USERS_DATABASE.some(u => u.pass === token);
      if (!authorized) return json({ error: "Não autorizado" }, 401);
      if (!env.DB) return json({ leads: [] });
      const result = await env.DB.prepare("SELECT * FROM leads ORDER BY data DESC LIMIT 200").all();
      return json({ leads: result.results });
    }

    const html = renderHTML(DEFAULT_PHONE);
    return new Response(html, { headers: { "content-type": "text/html;charset=UTF-8" } });
  }
};

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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json;charset=UTF-8" } });
}

function renderHTML(DEFAULT_PHONE) {
  const benefits = getAllBenefits(); // [{key,label,questions}]
  const dataPayload = JSON.stringify({ router: ROUTER_QUESTION, free: CAMPO_LIVRE_OPCIONAL, benefits });

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PrevConsulta - Triagem Previdenciária</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-[#0b132c] text-slate-100 min-h-screen flex items-center justify-center p-4">

  <div class="bg-[#0b132c] text-slate-100 p-6 sm:p-8 rounded-xl max-w-xl w-full border border-blue-900/50 shadow-2xl relative overflow-hidden">
    <div class="absolute inset-0 bg-[linear-gradient(to_right,#1e293b15_1px,transparent_1px),linear-gradient(to_bottom,#1e293b15_1px,transparent_1px)] bg-[size:14px_24px]"></div>

    <div class="relative z-10">
      <div class="border-b border-blue-900/40 pb-4 mb-6 flex flex-wrap gap-2 justify-between items-center">
        <div>
          <span class="text-blue-400 text-xs font-mono tracking-widest uppercase">// SIMULAÇÃO PREVIDENCIÁRIA</span>
          <h2 class="text-xl sm:text-2xl font-bold mt-1 text-white">Análise Preliminar de Benefício</h2>
        </div>
        <button onclick="abrirLoginModal()" class="text-xs text-slate-400 hover:text-blue-400 font-mono underline">Área Restrita</button>
      </div>

      <div id="form-area"></div>
    </div>
  </div>

  <div id="modal-login" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center hidden p-4">
    <div class="bg-[#132043] border border-blue-800 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
      <h3 class="text-lg font-bold text-white border-b border-blue-800/40 pb-2">Acesso ao Painel</h3>
      <div>
        <label class="block text-xs font-mono text-slate-300 mb-1">Usuário</label>
        <input type="text" id="user-login" class="w-full bg-[#0b132c] border border-blue-800/50 rounded-lg p-2 text-white text-sm outline-none">
      </div>
      <div>
        <label class="block text-xs font-mono text-slate-300 mb-1">Senha</label>
        <input type="password" id="pass-login" class="w-full bg-[#0b132c] border border-blue-800/50 rounded-lg p-2 text-white text-sm outline-none">
      </div>
      <div class="flex gap-2">
        <button onclick="autenticarUsuario()" class="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg font-bold text-xs">Entrar</button>
        <button onclick="fecharLoginModal()" class="w-full bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg font-bold text-xs">Cancelar</button>
      </div>
    </div>
  </div>

  <div id="modal-painel" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center hidden p-4">
    <div class="bg-[#132043] border border-blue-800 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto">
      <div class="flex justify-between items-center border-b border-blue-800/40 pb-4">
        <div>
          <span class="text-blue-400 text-xs font-mono">// GESTÃO DE ATENDIMENTOS</span>
          <h3 class="text-lg font-bold text-white">Painel PrevConsulta <span id="user-badge" class="text-xs font-normal text-slate-400"></span></h3>
        </div>
        <button onclick="fecharPainel()" class="text-slate-400 hover:text-white font-bold text-xl">✕</button>
      </div>
      <div id="leads-lista" class="space-y-2 text-sm text-slate-300">Carregando leads...</div>
    </div>
  </div>

  <script id="prevcontrol-data" type="application/json">${dataPayload}</script>
  <script>
    const DEFAULT_PHONE = "${DEFAULT_PHONE}";
    const DATA = JSON.parse(document.getElementById('prevcontrol-data').textContent);
    let authToken = null;
    let estado = { step: 'contato', nome: '', telefone: '', routerValue: null, benefitKey: null, questions: [], qIndex: 0, answers: {}, observacao: '' };

    function abrirLoginModal() { document.getElementById('modal-login').classList.remove('hidden'); }
    function fecharLoginModal() { document.getElementById('modal-login').classList.add('hidden'); }
    function fecharPainel() { document.getElementById('modal-painel').classList.add('hidden'); }

    function inputBase(id) {
      return \`w-full bg-[#132043] border border-blue-800/50 rounded-lg p-2.5 text-white text-sm outline-none focus:border-blue-500\`;
    }

    function render() {
      const area = document.getElementById('form-area');

      if (estado.step === 'contato') {
        area.innerHTML = \`
          <div class="space-y-4">
            <div>
              <label class="block text-xs font-mono text-slate-300 uppercase mb-1">Nome Completo</label>
              <input id="i-nome" class="\${inputBase()}" placeholder="Digite seu nome" value="\${estado.nome}">
            </div>
            <div>
              <label class="block text-xs font-mono text-slate-300 uppercase mb-1">WhatsApp (com DDD)</label>
              <input id="i-telefone" class="\${inputBase()}" placeholder="17999999999" value="\${estado.telefone}">
            </div>
            <button onclick="avancarContato()" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg text-sm uppercase">Continuar</button>
          </div>\`;
        return;
      }

      if (estado.step === 'router') {
        area.innerHTML = \`
          <label class="block text-sm font-bold text-white mb-3">\${DATA.router.label}</label>
          <div class="space-y-2">
            \${DATA.router.options.map(o => \`
              <button onclick='escolherRouter(\${JSON.stringify(o.value)})' class="w-full text-left bg-[#132043] hover:bg-[#1a2b57] border border-blue-800/50 rounded-lg p-3 text-sm text-white">\${o.label}</button>
            \`).join('')}
          </div>\`;
        return;
      }

      if (estado.step === 'perguntas') {
        const q = estado.questions[estado.qIndex];
        let campo = '';
        if (q.type === 'choice') {
          campo = \`<select id="i-resp" class="\${inputBase()}">\${q.options.map(op => \`<option value="\${op}">\${op}</option>\`).join('')}</select>\`;
        } else if (q.type === 'number') {
          campo = \`<input id="i-resp" type="number" class="\${inputBase()}" placeholder="\${q.unit || ''}">\`;
        } else {
          campo = \`<input id="i-resp" type="text" class="\${inputBase()}">\`;
        }
        area.innerHTML = \`
          <div class="text-xs text-slate-500 mb-2">Pergunta \${estado.qIndex + 1} de \${estado.questions.length}</div>
          <label class="block text-sm font-bold text-white mb-3">\${q.label}</label>
          \${campo}
          <button onclick="responderPergunta()" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg text-sm uppercase mt-4">\${estado.qIndex + 1 < estado.questions.length ? 'Próxima' : 'Continuar'}</button>\`;
        return;
      }

      if (estado.step === 'observacao') {
        area.innerHTML = \`
          <label class="block text-sm font-bold text-white mb-3">\${DATA.free.label}</label>
          <textarea id="i-obs" class="\${inputBase()} h-24" placeholder="Opcional"></textarea>
          <button onclick="finalizar()" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg text-sm uppercase mt-4">Gerar análise e enviar no WhatsApp</button>\`;
        return;
      }
    }

    function avancarContato() {
      estado.nome = document.getElementById('i-nome').value.trim();
      estado.telefone = document.getElementById('i-telefone').value.trim();
      if (!estado.nome || !estado.telefone) { alert('Preencha nome e WhatsApp.'); return; }
      estado.step = 'router';
      render();
    }

    function escolherRouter(value) {
      estado.routerValue = value;
      const key = value === 'bpc_loas_renovacao' ? 'bpc_loas' : value;
      const benefit = DATA.benefits.find(b => b.key === key);
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
      if (q.required && !val) { alert('Essa pergunta é obrigatória.'); return; }
      estado.answers[q.id] = val;
      if (estado.qIndex + 1 < estado.questions.length) {
        estado.qIndex++;
      } else {
        estado.step = 'observacao';
      }
      render();
    }

    async function finalizar() {
      estado.observacao = document.getElementById('i-obs').value.trim();
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
      const resumo = data.resumo || ('Olá! Sou ' + estado.nome + '.');
      window.open('https://wa.me/' + DEFAULT_PHONE + '?text=' + encodeURIComponent(resumo), '_blank');
    }

    async function autenticarUsuario() {
      const u = document.getElementById('user-login').value;
      const p = document.getElementById('pass-login').value;
      const res = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
      if (res.ok) {
        const data = await res.json();
        authToken = p;
        fecharLoginModal();
        document.getElementById('user-badge').innerText = '(' + data.role + ')';
        document.getElementById('modal-painel').classList.remove('hidden');
        carregarLeads();
      } else { alert('Usuário ou senha incorretos!'); }
    }

    async function carregarLeads() {
      const container = document.getElementById('leads-lista');
      try {
        const res = await fetch('/api/admin/leads', { headers: { 'Authorization': 'Bearer ' + authToken } });
        const data = await res.json();
        if (!data.leads || data.leads.length === 0) { container.innerHTML = '<p class="text-slate-500">Nenhum lead ainda.</p>'; return; }
        container.innerHTML = data.leads.map(l => \`
          <div class="bg-[#0b132c] border border-blue-900/40 rounded-lg p-3">
            <div class="flex justify-between text-xs text-slate-400">
              <span>\${l.data ? new Date(l.data).toLocaleString('pt-BR') : ''}</span>
              <span class="text-blue-400 font-bold">\${l.classification || ''}</span>
            </div>
            <div class="font-bold text-white">\${l.nome} — \${l.telefone}</div>
            <div class="text-xs text-slate-500">\${l.beneficio || ''}</div>
            <div class="text-xs text-slate-400 mt-1">\${l.rationale || ''}</div>
          </div>\`).join('');
      } catch (e) { container.innerHTML = '<p class="text-red-400">Erro ao carregar leads.</p>'; }
    }

    render();
  </script>
</body>
</html>`;
}
