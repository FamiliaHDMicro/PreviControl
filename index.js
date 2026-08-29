export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // --- TELEFONE PADRÃO DE ATENDIMENTO DO ESCRITÓRIO ---
    const DEFAULT_PHONE = "5517991087449";

    // --- CREDENCIAIS DOS USUÁRIOS DO PAINEL (Lendo das Variáveis de Ambiente) ---
    const USERS_DATABASE = [
      { user: "admin", pass: env.ADMIN_TOKEN || "admin7449", role: "Administrador (Cleiton)" },
      { user: "atendimento1", pass: env.USER1_TOKEN || "user123", role: "Atendente 01" },
      { user: "atendimento2", pass: env.USER2_TOKEN || "user1234", role: "Atendente 02" }
    ];

    // --- ROTA DE SEGURANÇA: Validação de Login no Servidor ---
    if (path === "/api/admin/login" && request.method === "POST") {
      try {
        const body = await request.json();
        const foundUser = USERS_DATABASE.find(
          u => u.user === body.username && u.pass === body.password
        );

        if (!foundUser) {
          return new Response(JSON.stringify({ error: "Usuário ou senha incorretos!" }), {
            status: 401,
            headers: { "content-type": "application/json;charset=UTF-8" }
          });
        }

        return new Response(JSON.stringify({ ok: true, role: foundUser.role }), {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Erro na requisição" }), { status: 400 });
      }
    }

    // --- ROTA DA API: Salvar Lead no Banco de Dados D1 ---
    if (path === "/api/leads" && request.method === "POST") {
      try {
        const body = await request.json();
        if (env.DB) {
          await env.DB.prepare(
            "INSERT INTO leads (nome, telefone, resumo, data) VALUES (?, ?, ?, ?)"
          ).bind(body.nome, body.telefone, body.resumo, new Date().toISOString()).run();
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, message: "Erro ao salvar no banco" }), { status: 500 });
      }
    }

    // --- RENDERIZAÇÃO DA INTERFACE (HTML / CSS / JS CLIENTE) ---
    const html = `<!DOCTYPE html>
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
      <div class="border-b border-blue-900/40 pb-4 mb-6 flex justify-between items-center">
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

  <!-- MODAL LOGIN PAINEL -->
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

  <!-- MODAL PAINEL DO ESCRITÓRIO -->
  <div id="modal-painel" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center hidden p-4">
    <div class="bg-[#132043] border border-blue-800 rounded-2xl max-w-md w-full p-6 space-y-6 shadow-2xl">
      <div class="flex justify-between items-center border-b border-blue-800/40 pb-4">
        <div>
          <span class="text-blue-400 text-xs font-mono">// GESTÃO DE ATENDIMENTOS</span>
          <h3 class="text-lg font-bold text-white">Painel PrevConsulta <span id="user-badge" class="text-xs font-normal text-slate-400"></span></h3>
        </div>
        <button onclick="fecharPainel()" class="text-slate-400 hover:text-white font-bold text-xl">✕</button>
      </div>

      <div class="bg-[#0b132c] p-4 rounded-xl border border-blue-800/40 space-y-3">
        <label class="block text-xs font-mono text-slate-300 uppercase">Número do WhatsApp do Escritório (com DDD):</label>
        <div class="flex gap-2">
          <input type="text" id="cfg-phone" placeholder="5517991087449" class="w-full bg-[#132043] border border-blue-800/50 rounded-lg p-2.5 text-white text-sm outline-none">
          <button onclick="salvarConfig()" class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap">Salvar Número</button>
        </div>
      </div>
    </div>
  </div>

  <script>
    const DEFAULT_PHONE = "${DEFAULT_PHONE}";

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
        fecharLoginModal();
        document.getElementById('user-badge').innerText = '(' + data.role + ')';
        document.getElementById('cfg-phone').value = localStorage.getItem('office_phone') || DEFAULT_PHONE;
        document.getElementById('modal-painel').classList.remove('hidden');
      } else {
        alert('Usuário ou senha incorretos!');
      }
    }

    function salvarConfig() {
      const num = document.getElementById('cfg-phone').value.trim();
      if(num) {
        localStorage.setItem('office_phone', num);
        alert('Número do WhatsApp salvo com sucesso!');
        fecharPainel();
      }
    }

    async function processarTriagem(e) {
      e.preventDefault();
      const nome = document.getElementById('nome').value;
      const sexo = document.getElementById('sexo').value;
      const idade = parseInt(document.getElementById('idade').value);
      const tempo = parseInt(document.getElementById('tempo').value);
      const especial = document.getElementById('especial').value;

      let msgResumo = \`Olá! Sou \${nome}. Solicito análise de triagem previdenciária.\\n\\n\`;
      msgResumo += \`- Sexo: \${sexo === 'M' ? 'Masculino' : 'Feminino'}\\n\`;
      msgResumo += \`- Idade: \${idade} anos\\n\`;
      msgResumo += \`- Tempo de Contribuição: \${tempo} anos\\n\`;
      msgResumo += \`- Detalhes Especiais: \${especial.toUpperCase()}\\n\`;

      // Salva no banco de dados SQLite (D1)
      fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, telefone: '', resumo: msgResumo })
      });

      // Redireciona para o WhatsApp do Escritório (Cleiton)
      const targetPhone = localStorage.getItem('office_phone') || DEFAULT_PHONE;
      const urlWa = \`https://wa.me/\${targetPhone}?text=\${encodeURIComponent(msgResumo)}\`;
      window.open(urlWa, '_blank');
    }
  </script>
</body>
</html>`;

    return new Response(html, {
      headers: { "content-type": "text/html;charset=UTF-8" },
    });
  }
};
