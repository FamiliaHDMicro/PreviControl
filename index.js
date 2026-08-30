Calma, sem pedir desculpa! Erro é parte do processo. Vamos corrigir agora. ️

O problema é simples: o index.js que está no seu repositório ainda é o antigo (com Jarvis, upload R2, etc). Por isso a build falha e o login não funciona.

Aqui está o index.js corrigido e completo — é só colar no lugar do atual no GitHub:

// index.js — PrevControl Worker (Terminal Burro / Single File)
// Custo zero · Sem IA · Sem juridiquês · Respeito com 50+
import {
  getAllBenefits,
  getBenefitConfig,
  runTriagem,
  CLASSIFICATION_LABELS,
  ROUTER_QUESTION,
  CAMPOLIVREOPCIONAL,
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

    // ---- API: Login admin ----
    if (path === "/api/admin/login" && request.method === "POST") {
      return handleLogin(request, env, corsHeaders);
    }

    // ---- API: Salvar lead ----
    if (path === "/api/leads" && request.method === "POST") {
      return handleLeads(request, env, corsHeaders);
    }

    // ---- API: Listar leads (admin) ----
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

    // ---- API: Atualizar lead (admin) ----
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
          UPDATE leads SET ${updates.join(", ")} WHERE id = ?
        ).bind(...params).run();
        return json({ ok: true }, corsHeaders);
      }, corsHeaders);
    }

    // ---- Fallback: servir landing page ----
    const html = renderHTML(env.WHATSAPP_NUMBER || "5517991087449");
    return new Response(html, {
      headers: { "Content-Type": "text/html;charset=UTF-8", ...corsHeaders }
    });
  },
};

// ============================================================
//  HANDLERS
// ============================================================

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
        INSERT INTO leads (name, phone, email, benefittype, answersjson, classification, rationale, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'novo')
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
    Olá! Sou ${nome} (${telefone}).,
    Situação: ${benefitLabel}${routerValue === "bpcloasrenovacao" ? " — Renovação/Revisão periódica" : ""},
    `,
    ...Object.entries(answers || {}).map(([k, v]) => - ${k}: ${v}),
  ];
  if (observacao) linhas.push(, Observação da pessoa: ${observacao});
  linhas.push(
    ,
    📋 Resultado da triagem automática: ${classificationLabel},
    📝 ${resultado.rationale},
    ,
    Este é um resultado inicial e automático — não substitui análise jurídica completa.
  );
  return linhas.join("\n");
}

async function handleAdminAuth(request, env, handler, corsHeaders) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace("Bearer ", "");

  const validTokens = [env.ADMINTOKEN, env.USER1TOKEN, env.USER2_TOKEN];
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

// ============================================================
//  HTML DA LANDING PAGE
// ============================================================

function renderHTML(WHATSAPP_NUMBER) {
  const routerData = JSON.stringify(ROUTER_QUESTION);
  const benefitsData = JSON.stringify(getAllBenefits());
  const campoLivreData = JSON.stringify(CAMPOLIVREOPCIONAL);

  return 

PrevConsulta — Triagem Previdenciária

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

  
    
      P
      PrevConsulta
    
    Área Restrita →
  
  
    
      
        
        TRIAGEM PREVIDENCIÁRIA · GRATUITA
      
      
        Descubra se você temdireito ao seu benefício
      
      
        Responda algumas perguntas simples. É rápido, sem complicação e sem juridiquês.
      
    
    
      
        Como funciona
        
          
            1
            Conte sua situação
          
          
            2
            Receba uma análise inicial
          
          
            3
            Envie pelo WhatsApp
          
        
      
    
  

  
    
    
  
  
    💡 Esta é uma análise inicial e automática. Não substitui uma consulta com advogado.
  

  
    
      Acesso ao Painel
      ✕
    
    
      Usuário
      
    
    
      Senha
      
    
    
      Entrar
      Cancelar
    
  

  
    
      
        // GESTÃO DE ATENDIMENTOS
        Painel 
      
      ✕
    
    Carregando leads...
  

const DEFAULTPHONE = "${WHATSAPPNUMBER}";
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
  if (d.length  {
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
    if (i \ : '';
    return \
      
        \${i 
        \${l}
      
      \${line}
    \;
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
    area.innerHTML = \
      
        
           Olá! Que bom ter você aqui. Vamos fazer uma análise rápida e sem complicação do seu benefício.
        
        
          Seu nome completo
          
        
        
          WhatsApp (com DDD)
          
        
        
        Continuar →
      \;
    const tel = document.getElementById('i-telefone');
    if (tel) aplicarMascara(tel);
    return;
  }

  if (estado.step === 'router') {
    area.innerHTML = \
      
        
          Etapa 2 de 4
          \${ROUTER.label}
          Escolha a opção que mais se parece com a sua situação.
        
        
          \${ROUTER.options.map(o => \
            
              \${o.label}
            
          \).join('')}
        
        ← Voltar
      \;
    return;
  }

  if (estado.step === 'perguntas') {
    const q = estado.questions[estado.qIndex];
    let campo = '';
    if (q.type === 'choice') {
      campo = \\${q.options.map(op => \\${op}\).join('')}\;
    } else if (q.type === 'number') {
      campo = \\;
    } else {
      campo = \\;
    }
    area.innerHTML = \
      
        
          Etapa 3 de 4 · Pergunta \${estado.qIndex + 1} de \${estado.questions.length}
          \${q.label}
        
        \${campo}
        
        
          ← Voltar
          \${estado.qIndex + 1 
        
      \;
    return;
  }

  if (estado.step === 'observacao') {
    area.innerHTML = \
      
        
          Etapa 4 de 4
          \${CAMPO_LIVRE.label}
        
        
        
          ← Voltar
          Gerar análise 
        
      \;
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
  if (!nome || nome.length  b.key === key);
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
  if (estado.qIndex + 1  0) { estado.qIndex--; render(); return; }
    else estado.step = 'router';
  }
  else if (estado.step === 'observacao') estado.step = 'perguntas';
  render();
}

async function finalizar() {
  estado.observacao = document.getElementById('i-obs').value.trim();
  const area = document.getElementById('form-area');
  area.innerHTML = \
    
    Enviando sua análise... aguarde um instante.
  \;

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

    estado.sucessoHTML = \
      
        🎉
        
          Obrigado, \${estado.nome.split(' ')[0]}!
          Sua análise foi enviada com sucesso.
        
        
          Resultado da triagem
          \${classLabel}
          \${rationale}
        
        
          💡 Importante: este é um resultado inicial e automático. Não substitui uma análise completa.
        
        
          
             Enviar resumo no WhatsApp
          
          
            Fazer nova análise
          
        
      \;

    estado.step = 'sucesso';
    render();
  } catch (e) {
    area.innerHTML = \
      😔
      Não conseguimos enviar sua análise.
      Tentar novamente
    \;
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
      container.innerHTML = 'Nenhum lead ainda.';
      return;
    }
    container.innerHTML = data.leads.map(l => \
      
        
          \${l.createdat ? new Date(l.createdat).toLocaleString('pt-BR') : ''}
          \${l.classification || ''}
        
        \${l.name} — \${l.phone}
        \${l.benefit_type || ''}
        \${l.rationale || ''}
      \).join('');
  } catch (e) {
    container.innerHTML = 'Erro ao carregar leads.';
  }
}

render();

;
}

📋 O que fazer agora (3 passos)

Substituir o index.js no GitHub
Abra: https://github.com/FamiliaHDMicro/PreviControl/edit/main/index.js
Apague tudo que está lá
Cole o código acima
Clique em "Commit changes"

Verificar os 4 secrets no Cloudflare
Vá em Workers & Pages → prevconsulta → Settings → Variables and Secrets e confirme:

| Nome | Tipo | Valor |
|---|---|---|
| ADMIN_TOKEN | Secret | cleiton7449 |
| USER1_TOKEN | Secret | user123a |
| USER2_TOKEN | Secret | user123b |
| WHATSAPP_NUMBER | Secret | 5517991087449 |

Aguardar o deploy automático
O Cloudflare vai detectar o push no GitHub e fazer o deploy sozinho (2-3 minutos).

✅ Depois do deploy, teste:

Abra prevcontrol.hdmicro-cliente.workers.dev
Clique em "Área Restrita →"
Tente: admin / cleiton7449`
Deve abrir o painel com os leads

Se der erro, me manda a mensagem exata que eu resolvo na hora. 🚀
