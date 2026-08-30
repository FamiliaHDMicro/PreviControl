// PrevConsulta — Frontend (Terminal Burro)
// Navegação horizontal em módulos · Custo zero

const WHATSAPP_NUMBER = "5517991087449";

const state = {
  currentSlide: 0,
  slides: [],
  answers: {
    nome: '', telefone: '',
    routerValue: null, benefitKey: null, benefitLabel: '',
    questionAnswers: {}, observacao: ''
  },
  routerOptions: [],
  benefits: {},
  campoLivre: null
};

function mascaraTelefone(valor) {
  const d = valor.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7,11)}`;
}

async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    state.routerOptions = data.router.options;
    state.benefits = {};
    data.benefits.forEach(b => { state.benefits[b.key] = b; });
    state.campoLivre = data.campoLivre;
  } catch (e) {
    console.error('Erro ao carregar config:', e);
  }
  buildSlides();
}

function buildSlides() {
  state.slides = [
    { type: 'welcome' },
    { type: 'router' },
    { type: 'final' },
    { type: 'success' }
  ];
  renderAllSlides();
  renderDots();
  goToSlide(0);
}

function renderAllSlides() {
  const track = document.getElementById('slideTrack');
  track.innerHTML = state.slides.map((slide, i) => renderSlide(slide, i)).join('');
}

function renderSlide(slide, i) {
  if (slide.type === 'welcome') return renderWelcome(i);
  if (slide.type === 'router') return renderRouter(i);
  if (slide.type === 'question') return renderQuestion(slide, i);
  if (slide.type === 'final') return renderFinal(i);
  if (slide.type === 'success') return renderSuccess(i);
  return '';
}

function renderWelcome(i) {
  return `
    <div class="slide" data-slide="${i}">
      <div class="module-card">
        <div class="module-number">👋 Início</div>
        <h2 class="module-title">Descubra se você tem direito ao seu benefício</h2>
        <p class="module-subtitle">Responda algumas perguntas simples. É rápido, sem complicação e sem juridiquês.</p>
        <div class="field-group">
          <label class="field-label">Seu nome completo</label>
          <input id="field-nome" class="input-base" placeholder="Como podemos te chamar?" value="${state.answers.nome}" maxlength="60">
        </div>
        <div class="field-group">
          <label class="field-label">WhatsApp (com DDD)</label>
          <input id="field-telefone" class="input-base" placeholder="(17) 99999-9999" value="${state.answers.telefone}" maxlength="15">
          <div class="field-error" id="erro-welcome"></div>
        </div>
        <div class="nav-row" style="justify-content: flex-end;">
          <button onclick="nextSlide()" class="nav-btn nav-btn-primary">Continuar →</button>
        </div>
      </div>
    </div>`;
}

function renderRouter(i) {
  return `
    <div class="slide" data-slide="${i}">
      <div class="module-card">
        <div class="module-number">📋 Etapa 1</div>
        <h2 class="module-title">O que está acontecendo com você hoje?</h2>
        <p class="module-subtitle">Escolha a opção que mais se parece com a sua situação.</p>
        <div class="options-stack">
          ${state.routerOptions.map((o, idx) => `
            <button onclick="selectRouter('${o.value}', this)" class="option-btn ${state.answers.routerValue === o.value ? 'selected' : ''}" data-value="${o.value}">
              <span class="option-marker">${idx + 1}</span>
              <span>${o.label}</span>
            </button>
          `).join('')}
        </div>
        <div class="nav-row">
          <button onclick="prevSlide()" class="nav-btn nav-btn-ghost">← Voltar</button>
          <button onclick="confirmRouter()" class="nav-btn nav-btn-primary" id="btn-router-next" disabled>Continuar →</button>
        </div>
      </div>
    </div>`;
}

function renderQuestion(slide, i) {
  const q = slide.question;
  const currentVal = state.answers.questionAnswers[q.id] || '';
  let inputHtml = '';
  if (q.type === 'choice') {
    inputHtml = `
      <div class="options-stack">
        ${q.options.map((op, idx) => `
          <button onclick="selectChoice('${q.id}', '${op}', this)" class="option-btn ${currentVal === op ? 'selected' : ''}" data-value="${op}">
            <span class="option-marker">${String.fromCharCode(65 + idx)}</span>
            <span>${op}</span>
          </button>
        `).join('')}
      </div>`;
  } else if (q.type === 'number') {
    inputHtml = `<input id="field-${q.id}" class="input-base" type="number" min="0" placeholder="Ex: ${q.unit === 'anos' ? '25' : '12'}" value="${currentVal}">`;
  } else {
    inputHtml = `<input id="field-${q.id}" class="input-base" type="text" placeholder="Sua resposta" value="${currentVal}">`;
  }

  return `
    <div class="slide" data-slide="${i}">
      <div class="module-card">
        <div class="module-number">📝 ${slide.number} · ${slide.questionIndex + 1} de ${slide.totalQuestions}</div>
        <h2 class="module-title">${q.label}</h2>
        ${q.unit ? `<p class="module-subtitle">Responda em ${q.unit}.</p>` : ''}
        ${inputHtml}
        <div class="field-error" id="erro-q-${q.id}"></div>
        <div class="nav-row">
          <button onclick="prevSlide()" class="nav-btn nav-btn-ghost">← Voltar</button>
          <button onclick="confirmQuestion('${q.id}')" class="nav-btn nav-btn-primary">${slide.questionIndex + 1 < slide.totalQuestions ? 'Próxima →' : 'Continuar →'}</button>
        </div>
      </div>
    </div>`;
}

function renderFinal(i) {
  return `
    <div class="slide" data-slide="${i}">
      <div class="module-card">
        <div class="module-number">✨ Finalizar</div>
        <h2 class="module-title">Quer contar mais alguma coisa?</h2>
        <p class="module-subtitle">Opcional. Conte o que quiser... ou pule esta etapa.</p>
        <textarea id="field-observacao" class="input-base" style="min-height: 120px; resize: vertical;" placeholder="Ex: tenho uma cirurgia marcada, estou desempregado...">${state.answers.observacao}</textarea>
        <div class="nav-row">
          <button onclick="prevSlide()" class="nav-btn nav-btn-ghost">← Voltar</button>
          <button onclick="submitFinal()" class="nav-btn nav-btn-primary">Gerar análise 🚀</button>
        </div>
      </div>
    </div>`;
}

function renderSuccess(i) {
  const label = state.answers.classificationLabel || '';
  const rationale = state.answers.rationale || '';
  let cardClass = 'neutral';
  let labelColor = '#94a3b8';
  if (state.answers.classification === 'provavel_direito') {
    cardClass = 'success';
    labelColor = '#10b981';
  } else if (state.answers.classification === 'precisa_avaliacao') {
    cardClass = 'warning';
    labelColor = '#f59e0b';
  }

  return `
    <div class="slide" data-slide="${i}">
      <div class="module-card">
        <div class="success-icon">✓</div>
        <div class="module-number" style="margin: 0 auto 1rem; display: flex; width: fit-content;">🎉 Concluído</div>
        <h2 class="module-title" style="text-align: center;">Obrigado, ${state.answers.nome.split(' ')[0]}!</h2>
        <p class="module-subtitle" style="text-align: center;">Sua análise foi enviada com sucesso.</p>
        <div class="result-card ${cardClass}">
          <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; font-weight: 600; margin-bottom: 0.5rem;">Resultado da triagem</div>
          <div style="font-size: 1.3rem; font-weight: 800; color: ${labelColor}; margin-bottom: 0.8rem;">${label}</div>
          <div style="font-size: 0.95rem; color: #e2e8f0; line-height: 1.6;">${rationale}</div>
        </div>
        <div class="info-box">
          💡 <strong style="color: #fff;">Importante:</strong> este é um resultado inicial e automático. Não substitui uma análise completa feita por um profissional.
        </div>
        <div style="display: flex; flex-direction: column; gap: 0.8rem; margin-top: 1.5rem;">
          <a href="#" id="btn-whatsapp" class="nav-btn nav-btn-whatsapp">📱 Enviar resumo no WhatsApp</a>
          <button onclick="restart()" class="nav-btn nav-btn-ghost" style="width: 100%; justify-content: center;">Fazer nova análise</button>
        </div>
      </div>
    </div>`;
}

function goToSlide(index) {
  if (index < 0 || index >= state.slides.length) return;
  state.currentSlide = index;
  const track = document.getElementById('slideTrack');
  const percent = (index / (state.slides.length - 1)) * 100;
  track.style.transform = `translateX(-${percent}%)`;

  document.querySelectorAll('.slide-dot').forEach((dot, i) => {
    dot.classList.remove('active', 'done');
    if (i === index) dot.classList.add('active');
    else if (i < index) dot.classList.add('done');
  });

  document.getElementById('progressBar').style.width = `${percent}%`;

  setTimeout(() => {
    const firstInput = document.querySelector(`[data-slide="${index}"] input, [data-slide="${index}"] textarea`);
    if (firstInput) firstInput.focus();
  }, 400);
}

function nextSlide() {
  const slide = state.slides[state.currentSlide];
  if (slide.type === 'welcome') {
    const nome = document.getElementById('field-nome').value.trim();
    const tel = document.getElementById('field-telefone').value.trim();
    const err = document.getElementById('erro-welcome');
    if (!nome || nome.length < 3) {
      err.textContent = 'Por favor, digite seu nome completo.';
      err.classList.add('show');
      return;
    }
    if (tel.replace(/\D/g,'').length < 10) {
      err.textContent = 'Por favor, digite um WhatsApp válido com DDD.';
      err.classList.add('show');
      return;
    }
    err.classList.remove('show');
    state.answers.nome = nome;
    state.answers.telefone = tel;
  }
  goToSlide(state.currentSlide + 1);
}

function prevSlide() {
  goToSlide(state.currentSlide - 1);
}

function selectRouter(value, btn) {
  state.answers.routerValue = value;
  document.querySelectorAll('[data-slide="1"] .option-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  document.getElementById('btn-router-next').disabled = false;
}

function confirmRouter() {
  if (!state.answers.routerValue) return;
  const key = state.answers.routerValue === 'bpc_loas_renovacao' ? 'bpc_loas' : state.answers.routerValue;
  const benefit = state.benefits[key];
  state.answers.benefitKey = key;
  state.answers.benefitLabel = benefit ? benefit.label : '';
  state.answers.questionAnswers = {};

  const questionSlides = (benefit ? benefit.questions : []).map((q, idx) => ({
    type: 'question',
    number: 'Etapa 2',
    question: q,
    questionIndex: idx,
    totalQuestions: benefit ? benefit.questions.length : 0
  }));

  state.slides = state.slides.filter(s => s.type !== 'question');
  state.slides.splice(2, 0, ...questionSlides);

  renderAllSlides();
  renderDots();
  goToSlide(2);
}

function selectChoice(qId, value, btn) {
  state.answers.questionAnswers[qId] = value;
  const slideIdx = state.currentSlide;
  document.querySelectorAll(`[data-slide="${slideIdx}"] .option-btn`).forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

function confirmQuestion(qId) {
  const slide = state.slides[state.currentSlide];
  const q = slide.question;
  const err = document.getElementById(`erro-q-${qId}`);

  if (q.type === 'choice') {
    if (!state.answers.questionAnswers[qId]) {
      err.textContent = 'Por favor, selecione uma opção.';
      err.classList.add('show');
      return;
    }
  } else {
    const val = document.getElementById(`field-${qId}`).value.trim();
    if (q.required && !val) {
      err.textContent = 'Essa pergunta é importante. Por favor, responda.';
      err.classList.add('show');
      return;
    }
    state.answers.questionAnswers[qId] = val;
  }
  err.classList.remove('show');
  goToSlide(state.currentSlide + 1);
}

async function submitFinal() {
  state.answers.observacao = document.getElementById('field-observacao').value.trim();

  const currentCard = document.querySelector(`[data-slide="${state.currentSlide}"] .module-card`);
  if (currentCard) {
    currentCard.innerHTML = `
      <div style="text-align: center; padding: 3rem 1rem;">
        <div style="display: inline-block; width: 48px; height: 48px; border: 4px solid rgba(59,130,246,0.3); border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite;"></div>
        <p style="color: #cbd5e1; margin-top: 1.5rem; font-size: 1.1rem;">Enviando sua análise... aguarde um instante.</p>
      </div>
      <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
    `;
  }

  try {
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: state.answers.nome,
        telefone: state.answers.telefone,
        routerValue: state.answers.routerValue,
        answers: state.answers.questionAnswers,
        observacao: state.answers.observacao
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Erro ao salvar');

    state.answers.classification = data.classification;
    state.answers.classificationLabel = data.classification_label;
    state.answers.rationale = data.rationale;

    setTimeout(() => {
      const btn = document.getElementById('btn-whatsapp');
      if (btn) btn.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(data.resumo)}`;
    }, 100);

    goToSlide(state.slides.length - 1);
  } catch (e) {
    if (currentCard) {
      currentCard.innerHTML = `
        <div style="text-align: center; padding: 3rem 1rem;">
          <div style="font-size: 3rem; margin-bottom: 1rem;"></div>
          <p style="color: #f87171; font-size: 1.1rem; margin-bottom: 1.5rem;">Não conseguimos enviar sua análise.</p>
          <button onclick="location.reload()" class="nav-btn nav-btn-primary">Tentar novamente</button>
        </div>
      `;
    }
  }
}

function restart() {
  state.answers = {
    nome: '', telefone: '', routerValue: null, benefitKey: null,
    benefitLabel: '', questionAnswers: {}, observacao: ''
  };
  state.slides = state.slides.filter(s => s.type !== 'question');
  renderAllSlides();
  renderDots();
  goToSlide(0);
}

function renderDots() {
  const dots = document.getElementById('slideDots');
  dots.innerHTML = state.slides.map((_, i) => `<button class="slide-dot" onclick="goToSlide(${i})" aria-label="Ir para etapa ${i+1}"></button>`).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  loadConfig();

  document.addEventListener('input', (e) => {
    if (e.target.id === 'field-telefone') {
      const pos = e.target.selectionStart;
      const antes = e.target.value.length;
      e.target.value = mascaraTelefone(e.target.value);
      const depois = e.target.value.length;
      e.target.setSelectionRange(pos + (depois - antes), pos + (depois - antes));
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowRight') nextSlide();
    if (e.key === 'ArrowLeft') prevSlide();
  });
});
