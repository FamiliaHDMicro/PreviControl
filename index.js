// index.js — PrevControl / PrevConsulta (Terminal Burro / Single File, custo zero)
// Correções aplicadas:
//  1) Agora usa rules.js para classificar a triagem (provavel_direito / precisa_avaliacao / sem_direito)
//  2) O telefone do lead passa a ser salvo de verdade na tabela `leads`

import { runTriagem, CLASSIFICATION_LABELS } from "./rules.js";

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

    // ---- Login do painel ----
    if (path === "/api/admin/login" && request.method === "POST") {
      try {
        const body = await request.json();
        const foundUser = USERS_DATABASE.find(
          u => u.user === body.username && u.pass === body.password
        );
        if (!foundUser) {
          return json({ error: "Usuário ou senha incorretos!" }, 401);
        }
        return json({ ok: true, role: foundUser.role });
      } catch (e) {
        return json({ error: "Erro na requisição" }, 400);
      }
    }

    // ---- Salvar lead (agora com classificação + telefone) ----
    if (path === "/api/leads" && request.method === "POST") {
      try {
        const body = await request.json();
        const { nome, telefone, idade, tempo, sexo, especial } = body;

        if (!nome || !telefone) {
          return json({ ok: false, message: "Nome e telefone são obrigatórios." }, 400);
        }

        // Monta as respostas no formato que o rules.js espera (aposentadoria por idade
        // como triagem inicial padrão deste formulário simplificado)
        const answers = {
          age: idade,
          contrib_years: tempo,
          gender: sexo === "F" ? "mulher" : "homem"
        };

        const resultado = runTriagem("aposentadoria_idade", answers);
        const classificationLabel = CLASSIFICATION_LABELS[resultado.class] || resultado.class;

        const resumo = montarResumo({ nome, sexo, idade, tempo, especial, resultado, classificationLabel });

        if (env.DB) {
          await env.DB.prepare(
            `INSERT INTO leads (nome, telefone, resumo, classification, rationale, data)
             VALUES (?, ?, ?, ?, ?, ?)`
          ).bind(
            nome, telefone, resumo, resultado.class, resultado.rationale, new Date().toISOString()
          ).run();
        }

        return json({
          ok: true,
          resumo,
          classification: resultado.class,
          classification_label: classificationLabel,
          rationale: resultado.rationale
        });
      } catch (e) {
        console.error("erro /api/leads:", e);
        return json({ ok: false, message: "Erro ao salvar no banco: " + e.message }, 500);
      }
    }

    // ---- Listar leads (painel do escritório, autenticado) ----
    if (path === "/api/admin/leads" && request.method === "GET") {
      const auth = request.headers.get("Authorization") || "";
      const token = auth.replace("Bearer ", "");
      const authorized = USERS_DATABASE.some(u => u.pass === token);
      if (!authorized) return json({ error: "Não autorizado" }, 401);

      if (!env.DB) return json({ leads: [] });
      const result = await env.DB.prepare(
        "SELECT * FROM leads ORDER BY data DESC LIMIT 200"
      ).all();
      return json({ leads: result.results });
    }

    // ---- Página (formulário) ----
    const html = renderHTML(DEFAULT_PHONE);
    return new Response(html, {
      headers: { "content-type": "text/html;charset=UTF-8" },
    });
  }
};

// Monta o texto de resumo que vai pro WhatsApp, incluindo o resultado da triagem
function montarResumo({ nome, sexo, idade, tempo, especial, resultado, classificationLabel }) {
  const linhas = [
    `Olá! Sou ${nome}. Solicito análise de triagem previdenciária.`,
    ``,
    `- Sexo: ${sexo === "M" ? "Masculino" : "Feminino"}`,
    `- Idade: ${idade} anos`,
    `- Tempo de Contribuição: ${tempo} anos`,
    `- Detalhes Especiais: ${(especial || "").toUpperCase()}`,
    ``,
    `📋 Resultado da triagem automática: ${classificationLabel}`,
    `📝 ${resultado.rationale}`,
    ``,
    `Este é um resultado inicial e automático — não substitui análise jurídica completa.`
  ];
  return linhas.join("\n");
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json;charset=UTF-8" },
  });
}

function renderHTML(DEFAULT_PHONE) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PrevConsulta - Triagem Previdenciária</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-[#0b132c] text-slate-100 min-h-screen flex items-center justify-center p-4">

  <div class="bg-[#0b132c] text-slate-100 p-8 rounded-xl max-w-xl w-full border border-blue-900/50 shadow-2xl relative overflow-hidden">
    <div class="absolute inset-0 bg-[linear-gradient(to_right,#1e293b15_1px,transparent_1px),linear-gradient(to_bottom,#1e293b15_1px,transparent_1px)] bg-[size:14px_24px]"></div>

    <div class="relative z-10">
      <div class="border-b border-blue-900/40 pb-4 mb-6 flex flex-wrap gap-2 justify-between items-center">
        <div>
          <span class="text-blue-400 text-xs font-mono tracking-widest uppercase">// SIMULAÇÃO PREVIDENCIÁRIA</span>
          <h2 class="text-2xl font-bold mt-1 text-white">Análise Preliminar de Benefício</h2>
        </div>
        <button onclick="abrirLoginModal()" class="text-xs text-slate-400 hover:text-blue-400 font-mono underline">Área Restrita</button>
      </div>

      <form id="form-triagem" class="space-y-4" onsubmit="processarTriagem(event)">
        <div>
          <label class="block text-xs font-mono text-slate-300 uppercase mb-1">Nome Completo</label>
          <input type="text" id="nome" required placeholder="Digite seu nome" class="w-full bg-[#132043] border border-blue-800/50 rounded-lg p-2.5 text-white text-sm outline-none focus:border-blue-500">
        </div>

        <div>
          <label class="block text-xs font-mono text-slate-300 uppercase mb-1">WhatsApp (com DDD)</label>
          <input type="tel" id="telefone" required placeholder="17999999999" class="w-full bg-[#132043] border border-blue-800/50 rounded-lg p-2.5 text-white text-sm outline-none focus:border-blue-500">
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-mono text-slate-300 uppercase mb-1">Sexo Biológico</label>
            <select id="sexo" class="w-full bg-[#132043] border border-blue-800/50 rounded-lg p-2.5 text-white text-sm outline-none focus:border-blue-500">
              <option value="M">Masculino</option>
              <option value="F">Feminino</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-mono text-slate-300 uppercase mb-1">Idade Atual</label>
            <input type="number" id="idade" required placeholder="Ex: 58" class="w-full bg-[#132043] border border-blue-800/50 rounded-lg p-2.5 text-white text-sm outline-none focus:border-blue-500">
          </div>
        </div>

        <div>
          <label class="block text-xs font-mono text-slate-300 uppercase mb-1">Tempo de Contribuição / Trabalhado (Anos)</label>
          <input type="number" id="tempo" required placeholder="Ex: 25" class="w-full bg-[#132043] border border-blue-800/50 rounded-lg p-2.5 text-white text-sm outline-none focus:border-blue-500">
        </div>

        <div>
          <label class="block text-xs font-mono text-slate-300 uppercase mb-1">Já contribuiu como MEI ou Trabalhador Rural?</label>
          <select id="especial" class="w-full bg-[#132043] border border-blue-800/50 rounded-lg p-2.5 text-white text-sm outline-none focus:border-blue-500">
            <option value="nao">Não, apenas CLT ou Carnê individual</option>
            <option value="mei">Sim, possui tempo como MEI</option>
            <option value="rural">Sim, possui tempo Rural/Agricultor</option>
            <option value="ambos">Ambos (MEI e Rural)</option>
          </select>
        </div>

        <button type="submit" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg transition-all text-sm uppercase tracking-wide">
          Gerar Análise e Enviar no WhatsApp
        </button>
      </form>
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

  <script>
    const DEFAULT_PHONE = "${DEFAULT_PHONE}";
    let authToken = null;

    function abrirLoginModal() { document.getElementById('modal-login').classList.remove('hidden'); }
    function fecharLoginModal() { document.getElementById('modal-login').classList.add('hidden'); }
    function fecharPainel() { document.getElementById('modal-painel').classList.add('hidden'); }

    async function autenticarUsuario() {
      const u = document.getElementById('user-login').value;
      const p = document.getElementById('pass-login').value;
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
    }

    async function carregarLeads() {
      const container = document.getElementById('leads-lista');
      try {
        const res = await fetch('/api/admin/leads', {
          headers: { 'Authorization': 'Bearer ' + authToken }
        });
        const data = await res.json();
        if (!data.leads || data.leads.length === 0) {
          container.innerHTML = '<p class="text-slate-500">Nenhum lead ainda.</p>';
          return;
        }
        container.innerHTML = data.leads.map(l => \`
          <div class="bg-[#0b132c] border border-blue-900/40 rounded-lg p-3">
            <div class="flex justify-between text-xs text-slate-400">
              <span>\${l.data ? new Date(l.data).toLocaleString('pt-BR') : ''}</span>
              <span class="text-blue-400 font-bold">\${l.classification || ''}</span>
            </div>
            <div class="font-bold text-white">\${l.nome} — \${l.telefone}</div>
            <div class="text-xs text-slate-400 mt-1">\${l.rationale || ''}</div>
          </div>
        \`).join('');
      } catch (e) {
        container.innerHTML = '<p class="text-red-400">Erro ao carregar leads.</p>';
      }
    }

    async function processarTriagem(e) {
      e.preventDefault();
      const nome = document.getElementById('nome').value;
      const telefone = document.getElementById('telefone').value;
      const sexo = document.getElementById('sexo').value;
      const idade = parseInt(document.getElementById('idade').value);
      const tempo = parseInt(document.getElementById('tempo').value);
      const especial = document.getElementById('especial').value;

      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, telefone, sexo, idade, tempo, especial })
      });
      const data = await res.json();

      const resumo = data.resumo || (\`Olá! Sou \${nome}.\`);
      const urlWa = \`https://wa.me/\${DEFAULT_PHONE}?text=\${encodeURIComponent(resumo)}\`;
      window.open(urlWa, '_blank');
    }
  </script>
</body>
</html>`;
}
