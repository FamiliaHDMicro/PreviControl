export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // --- CREDENCIAIS DOS USUÁRIOS DO PAINEL ---
    const USERS_DATABASE = [
      { user: "admin", pass: env.ADMIN_TOKEN || "admin7449", role: "Administrador (Cleiton)" },
      { user: "atendimento1", pass: "user123", role: "Atendente 01" },
      { user: "atendimento2", pass: "user1234", role: "Atendente 02" }
    ];

    // --- ROTA DE SEGURANÇA: Valida Usuário e Senha no Servidor ---
    if (path === "/api/admin/login" && request.method === "POST") {
      try {
        const body = await request.json();
        const foundUser = USERS_DATABASE.find(
          u => u.user === body.username && u.pass === body.password
        );

        if (!foundUser) {
          return new Response(JSON.stringify({ error: "Usuário ou senha incorretos!" }), {
            status: 401,
            headers: { "content-type": "application/json" }
          });
        }

        return new Response(JSON.stringify({ ok: true, role: foundUser.role }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Erro na requisição" }), { status: 400 });
      }
    }

    // --- ROTA PRINCIPAL: Landing Page (Terminal Burro) ---
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PrevConsulta — Triagem de Benefícios</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    .bg-grid {
      background-size: 24px 24px;
      background-image: 
        linear-gradient(to right, rgba(30, 58, 138, 0.15) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(30, 58, 138, 0.15) 1px, transparent 1px);
    }
  </style>
</head>
<body class="bg-[#0b132c] text-slate-100 min-h-screen font-sans bg-grid flex flex-col justify-between">

  <!-- Header -->
  <header class="border-b border-blue-900/40 bg-[#0b132c]/95 backdrop-blur sticky top-0 z-40">
    <div class="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-bold text-white shadow-lg shadow-blue-600/50">P</div>
        <span class="font-bold text-lg tracking-wide text-white">PREV<span class="text-blue-500">CONSULTA</span></span>
      </div>
      <button onclick="solicitarAcessoPainel()" class="bg-blue-600/20 border border-blue-500/40 text-blue-400 hover:bg-blue-600 hover:text-white px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2">
        🔒 PAINEL DO ESCRITÓRIO
      </button>
    </div>
  </header>

  <!-- Conteúdo Principal -->
  <main class="max-w-7xl mx-auto px-6 py-12 grid lg:grid-cols-12 gap-12 items-center flex-1">
    <div class="lg:col-span-6 space-y-6">
      <span class="px-3 py-1 rounded-full bg-blue-950 border border-blue-800 text-blue-400 text-xs font-mono">
        SISTEMA DE TRIAGEM RÁPIDA
      </span>
      <h1 class="text-4xl lg:text-5xl font-black text-white leading-tight">
        Análise preliminar de direitos previdenciários.
      </h1>
      <p class="text-slate-400 text-base">
        Responda a poucas perguntas para obter o diagnóstico imediato e enviar o resumo diretamente ao nosso atendimento.
      </p>
    </div>

    <!-- Formulário -->
    <div class="lg:col-span-6">
      <div class="bg-[#132043] border border-blue-800/50 rounded-2xl p-6 lg:p-8 shadow-2xl">
        <div id="step-1" class="space-y-4">
          <h2 class="text-xl font-bold text-white border-b border-blue-800/40 pb-3">Selecione o assunto:</h2>
          <button onclick="iniciarQuiz('aposentadoria_idade')" class="w-full p-4 rounded-xl bg-[#0b132c] border border-blue-800/40 text-left hover:border-blue-500 hover:bg-blue-900/20 transition flex justify-between items-center group">
            <div>
              <div class="font-bold text-white group-hover:text-blue-400">Aposentadoria por Idade</div>
              <div class="text-xs text-slate-400">Mulher (62+) ou Homem (65+)</div>
            </div>
            <span class="text-blue-500 font-bold">→</span>
          </button>
          <button onclick="iniciarQuiz('auxilio_doenca')" class="w-full p-4 rounded-xl bg-[#0b132c] border border-blue-800/40 text-left hover:border-blue-500 hover:bg-blue-900/20 transition flex justify-between items-center group">
            <div>
              <div class="font-bold text-white group-hover:text-blue-400">Auxílio-Doença</div>
              <div class="text-xs text-slate-400">Incapacidade por motivo de saúde</div>
            </div>
            <span class="text-blue-500 font-bold">→</span>
          </button>
        </div>

        <div id="step-2" class="space-y-4 hidden">
          <div id="questions-box" class="space-y-4"></div>
          <div class="pt-4 border-t border-blue-800/40 space-y-3">
            <label class="block text-xs font-mono text-slate-300 uppercase">Seus Dados para Contato:</label>
            <input type="text" id="user-name" placeholder="Seu Nome Completo" class="w-full bg-[#0b132c] border border-blue-800/50 rounded-lg p-3 text-white text-sm outline-none focus:border-blue-500">
            <input type="tel" id="user-phone" placeholder="Seu WhatsApp com DDD" class="w-full bg-[#0b132c] border border-blue-800/50 rounded-lg p-3 text-white text-sm outline-none focus:border-blue-500">
          </div>
          <div class="flex gap-3 pt-2">
            <button onclick="resetar()" class="w-1/3 bg-[#0b132c] border border-blue-800/40 text-slate-300 font-semibold py-3 rounded-lg hover:bg-blue-900/30 text-sm">Voltar</button>
            <button onclick="gerarResultado()" class="w-2/3 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg shadow-lg text-sm">Ver Resultado</button>
          </div>
        </div>

        <div id="step-3" class="space-y-4 hidden">
          <div id="result-box" class="p-4 rounded-xl border"></div>
          <a id="btn-wa" href="#" target="_blank" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-lg flex items-center justify-center gap-2 shadow-lg text-sm">
            Enviar para Atendimento no WhatsApp →
          </a>
          <button onclick="resetar()" class="w-full text-center text-xs text-slate-400 hover:text-white pt-1">Nova Simulação</button>
        </div>
      </div>
    </div>
  </main>

  <!-- PAINEL DO ESCRITÓRIO (PROTEGIDO) -->
  <div id="modal-painel" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center hidden p-4">
    <div class="bg-[#132043] border border-blue-800 rounded-2xl max-w-4xl w-full p-6 space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto">
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
          <input type="text" id="cfg-phone" placeholder="5517999999999" class="w-full bg-[#132043] border border-blue-800/50 rounded-lg p-2.5 text-white text-sm outline-none">
          <button onclick="salvarConfig()" class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap">Salvar Número</button>
        </div>
      </div>

      <div class="space-y-3">
        <h4 class="text-sm font-bold text-white uppercase font-mono">Triagens Gravadas no Navegador Local:</h4>
        <div class="overflow-x-auto border border-blue-800/40 rounded-xl">
          <table class="w-full text-left text-xs text-slate-300">
            <thead class="bg-[#0b132c] text-blue-400 font-mono uppercase">
              <tr>
                <th class="p-3">Data</th>
                <th class="p-3">Nome</th>
                <th class="p-3">Telefone</th>
                <th class="p-3">Assunto</th>
                <th class="p-3">Status</th>
                <th class="p-3">Ação</th>
              </tr>
            </thead>
            <tbody id="tabla-leads" class="divide-y divide-blue-800/30 bg-[#132043]"></tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <footer class="border-t border-blue-900/40 py-4 text-center text-xs text-slate-500 font-mono">
    PrevConsulta © 2026 — Sistema de Triagem Direta
  </footer>

  <script>
    const BENEFIT_CONFIGS = {
      aposentadoria_idade: {
        label: "Aposentadoria por Idade",
        questions: [
          { id: "sexo", label: "Gênero no documento oficial / CPF", type: "choice", options: ["mulher", "homem"] },
          { id: "idade", label: "Sua idade atual", type: "number", min: 18, max: 100 },
          { id: "tempo_anos", label: "Tempo de contribuição (Anos)", type: "number", min: 0, max: 70 },
          { id: "tempo_meses", label: "Tempo de contribuição (Meses)", type: "number", min: 0, max: 11 }
        ]
      },
      auxilio_doenca: {
        label: "Auxílio-Doença / Incapacidade",
        questions: [
          { id: "laudo", label: "Possui laudo médico recente?", type: "choice", options: ["sim", "nao"] },
          { id: "afastado", label: "Está afastado há mais de 15 dias?", type: "choice", options: ["sim", "nao"] }
        ]
      }
    };

    const CLASSIFICATION_LABELS = {
      provavel_direito: "✅ Provável Direito Encontrado",
      precisa_avaliacao: "⚠️ Necessita Avaliação Detalhada",
      sem_direito: "❌ Requisitos Mínimos Não Atingidos"
    };

    function runTriagem(benefitKey, answers) {
      if (benefitKey === 'aposentadoria_idade') {
        const idade = parseInt(answers.idade || 0);
        const anos = parseInt(answers.tempo_anos || 0);
        const meses = parseInt(answers.tempo_meses || 0);
        const tempoTotalAnos = anos + (meses / 12);
        const sexo = answers.sexo;

        const idadeMinima = sexo === 'mulher' ? 62 : 65;
        const tempoMinimo = 15;

        if (idade >= idadeMinima && tempoTotalAnos >= tempoMinimo) {
          return { class: 'provavel_direito', rationale: \`Você atinge a idade mínima (\${idadeMinima} anos) e possui \${anos} anos e \${meses} meses de contribuição.\` };
        } else {
          return { class: 'sem_direito', rationale: \`Necessário \${idadeMinima} anos de idade e 15 anos de contribuição. Informado: \${anos} anos e \${meses} meses.\` };
        }
      }

      if (benefitKey === 'auxilio_doenca') {
        if (answers.laudo === 'sim' && answers.afastado === 'sim') {
          return { class: 'provavel_direito', rationale: 'Com laudo e incapacidade continuada, o pedido de auxílio temporário é recomendado.' };
        }
        return { class: 'precisa_avaliacao', rationale: 'Recomendamos análise completa dos laudos pela equipe jurídica.' };
      }

      return { class: 'precisa_avaliacao', rationale: 'Dados iniciais coletados para análise do advogado.' };
    }

    let benefitAtual = null;
    let respostas = {};
    let configWhatsApp = localStorage.getItem('cfg_wa') || '5517999999999';

    document.getElementById('cfg-phone').value = configWhatsApp;

    // --- AUTENTICAÇÃO MULTI-USUÁRIO COM O SERVIDOR ---
    async function solicitarAcessoPainel() {
      const username = prompt("Usuário:");
      if (!username) return;
      const password = prompt("Senha:");
      if (!password) return;

      try {
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (res.ok) {
          document.getElementById('user-badge').textContent = \`(\${data.role})\`;
          document.getElementById('modal-painel').classList.remove('hidden');
          atualizarTabelaLeads();
        } else {
          alert(data.error || "Acesso Negado: Usuário ou senha incorretos!");
        }
      } catch(e) {
        alert("Erro ao validar acesso com o servidor.");
      }
    }

    function fecharPainel() {
      document.getElementById('modal-painel').classList.add('hidden');
    }

    function iniciarQuiz(key) {
      benefitAtual = key;
      respostas = {};
      const config = BENEFIT_CONFIGS[key];
      const box = document.getElementById('questions-box');
      box.innerHTML = '';

      config.questions.forEach(q => {
        const div = document.createElement('div');
        div.className = 'space-y-1';
        
        const label = document.createElement('label');
        label.className = 'block text-xs font-mono text-slate-300 uppercase';
        label.textContent = q.label;
        div.appendChild(label);

        if (q.type === 'choice') {
          const grid = document.createElement('div');
          grid.className = 'grid grid-cols-2 gap-2';
          q.options.forEach(opt => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'p-3 rounded-lg bg-[#0b132c] border border-blue-800/40 text-xs font-bold uppercase hover:bg-blue-600 hover:text-white transition';
            btn.textContent = opt;
            btn.onclick = () => {
              grid.querySelectorAll('button').forEach(b => b.className = 'p-3 rounded-lg bg-[#0b132c] border border-blue-800/40 text-xs font-bold uppercase hover:bg-blue-600 hover:text-white transition');
              btn.className = 'p-3 rounded-lg bg-blue-600 border border-blue-500 text-xs font-bold uppercase text-white transition';
              respostas[q.id] = opt;
            };
            grid.appendChild(btn);
          });
          div.appendChild(grid);
        } else {
          const input = document.createElement('input');
          input.type = 'number';
          input.min = q.min || 0;
          input.max = q.max || 100;
          input.placeholder = \`Ex: \${q.min || 0}\`;
          input.className = 'w-full bg-[#0b132c] border border-blue-800/50 rounded-lg p-3 text-white text-sm outline-none focus:border-blue-500';
          input.oninput = (e) => respostas[q.id] = e.target.value;
          div.appendChild(input);
        }

        box.appendChild(div);
      });

      document.getElementById('step-1').classList.add('hidden');
      document.getElementById('step-2').classList.remove('hidden');
    }

    function gerarResultado() {
      const nome = document.getElementById('user-name').value;
      const fone = document.getElementById('user-phone').value;

      if (!nome || !fone) {
        alert('Por favor, preencha seu nome e telefone WhatsApp.');
        return;
      }

      const res = runTriagem(benefitAtual, respostas);
      const resultBox = document.getElementById('result-box');
      const btnWa = document.getElementById('btn-wa');

      const cores = {
        provavel_direito: 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300',
        precisa_avaliacao: 'bg-amber-950/50 border-amber-500/40 text-amber-300',
        sem_direito: 'bg-rose-950/50 border-rose-500/40 text-rose-300'
      };

      resultBox.className = \`p-4 rounded-xl border \${cores[res.class]}\`;
      resultBox.innerHTML = \`
        <div class="font-bold text-sm mb-1">\${CLASSIFICATION_LABELS[res.class]}</div>
        <div class="text-xs opacity-90">\${res.rationale}</div>
      \`;

      const lead = {
        id: Date.now(),
        data: new Date().toLocaleDateString('pt-BR'),
        nome: nome,
        fone: fone,
        assunto: BENEFIT_CONFIGS[benefitAtual].label,
        resultado: CLASSIFICATION_LABELS[res.class],
        status: 'Pendente'
      };

      const leadsAtuais = JSON.parse(localStorage.getItem('prevconsulta_leads') || '[]');
      leadsAtuais.unshift(lead);
      localStorage.setItem('prevconsulta_leads', JSON.stringify(leadsAtuais));

      const msg = encodeURIComponent(\`Olá! Meu nome é \${nome}.\nAssunto: \${BENEFIT_CONFIGS[benefitAtual].label}\nResultado da Triagem: \${CLASSIFICATION_LABELS[res.class]}\nResumo: \${res.rationale}\`);
      btnWa.href = \`https://wa.me/\${configWhatsApp}?text=\${msg}\`;

      document.getElementById('step-2').classList.add('hidden');
      document.getElementById('step-3').classList.remove('hidden');
    }

    function resetar() {
      document.getElementById('step-2').classList.add('hidden');
      document.getElementById('step-3').classList.add('hidden');
      document.getElementById('step-1').classList.remove('hidden');
    }

    function salvarConfig() {
      const num = document.getElementById('cfg-phone').value;
      configWhatsApp = num;
      localStorage.setItem('cfg_wa', num);
      alert('Número salvo!');
    }

    function atualizarTabelaLeads() {
      const leads = JSON.parse(localStorage.getItem('prevconsulta_leads') || '[]');
      const tbody = document.getElementById('tabla-leads');
      tbody.innerHTML = '';

      if (leads.length === 0) {
        tbody.innerHTML = \`<tr><td colspan="6" class="p-4 text-center text-slate-500">Nenhuma triagem realizada neste dispositivo.</td></tr>\`;
        return;
      }

      leads.forEach(l => {
        const tr = document.createElement('tr');
        tr.innerHTML = \`
          <td class="p-3">\${l.data}</td>
          <td class="p-3 font-bold text-white">\${l.nome}</td>
          <td class="p-3">\${l.fone}</td>
          <td class="p-3">\${l.assunto}</td>
          <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] \${l.status === 'Atendido' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-amber-950 text-amber-400 border border-amber-800'}">\${l.status}</span></td>
          <td class="p-3">
            <button onclick="marcarAtendido(\${l.id})" class="text-blue-400 hover:underline">Alternar Status</button>
          </td>
        \`;
        tbody.appendChild(tr);
      });
    }

    function marcarAtendido(id) {
      let leads = JSON.parse(localStorage.getItem('prevconsulta_leads') || '[]');
      leads = leads.map(l => {
        if (l.id === id) l.status = l.status === 'Pendente' ? 'Atendido' : 'Pendente';
        return l;
      });
      localStorage.setItem('prevconsulta_leads', JSON.stringify(leads));
      atualizarTabelaLeads();
    }
  </script>
</body>
</html>`;

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8" }
    });
  }
};
