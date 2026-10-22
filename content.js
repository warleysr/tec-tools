/**
 * TEC-Tools — Content Script
 * Wheel Menu estilo Apple (filee.sh), Envio para Anki e Explicação com IA.
 */

(function () {
  'use strict';

  // Suporte cross-browser (Firefox WebExtensions & Chromium)
  const extAPI = typeof browser !== 'undefined' ? browser : chrome;

  // Previne injeção duplicada
  if (window.__TEC_TOOLS_LOADED__) return;
  window.__TEC_TOOLS_LOADED__ = true;

  let currentConfig = null;
  let activeQuestion = null;
  let lastMousePos = { x: window.innerWidth - 180, y: window.innerHeight - 180 };

  const DEFAULT_HOTKEY = {
    altKey: true,
    ctrlKey: false,
    shiftKey: false,
    metaKey: false,
    code: 'KeyW',
    key: 'w',
    display: 'Alt + W'
  };

  const ACTION_NUMBERS = {
    '1': 'anki',
    '2': 'ia'
  };

  // Ícones SVG minimalistas estilo Apple (SF Symbols)
  const ICONS = {
    wheel: `<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>`,
    anki: `<svg viewBox="0 0 24 24"><path d="M19.5 21a3 3 0 0 0 3-3v-4.5a3 3 0 0 0-3-3h-1.5V6a3 3 0 0 0-3-3h-9a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h10.5zm-12-16h9a1 1 0 0 1 1 1v4.5H6V6a1 1 0 0 1 1-1zm-1 7.5h10.5v5.5a1 1 0 0 1-1 1H6.5a1 1 0 0 1-1-1v-5.5zm13.5 0h1a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1h-1v-6.5z"/></svg>`,
    ai: `<svg viewBox="0 0 24 24"><path d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z"/></svg>`,
    check: `<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`,
    copy: `<svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`,
    refresh: `<svg viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>`
  };

  // Inicialização e carregamento de configurações
  async function init() {
    try {
      const res = await extAPI.runtime.sendMessage({ action: 'GET_CONFIG' });
      if (res && res.success) {
        currentConfig = res.config;
      }
    } catch {}

    injectUI();
    bindEvents();
  }

  // Criação dos elementos DOM da extensão
  function injectUI() {
    // 1. Floating Dock Trigger (Visível por padrão com ícone minimalista)
    const dock = document.createElement('div');
    dock.id = 'tec-tools-dock';
    dock.title = 'TEC-Tools (Alt+W)';
    if (currentConfig && currentConfig.showDockPill === false) {
      dock.classList.add('tt-hidden');
    }
    dock.innerHTML = `<div class="tt-dock-icon">${ICONS.wheel}</div>`;
    document.body.appendChild(dock);

    // 2. Wheel Overlay & Radial Donut Menu (Sempre centralizada)
    const overlay = document.createElement('div');
    overlay.id = 'tec-tools-wheel-overlay';
    overlay.innerHTML = `
      <div id="tec-tools-wheel">
        <svg class="tt-wheel-svg" viewBox="0 0 290 290">
          <defs>
            <linearGradient id="ttGradAnki" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#0071e3" stop-opacity="0.85"/>
              <stop offset="100%" stop-color="#0051a8" stop-opacity="0.85"/>
            </linearGradient>
            <linearGradient id="ttGradIA" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#af52de" stop-opacity="0.85"/>
              <stop offset="100%" stop-color="#7c2ea8" stop-opacity="0.85"/>
            </linearGradient>
          </defs>

          <!-- Left Slice: Enviar para Anki (Setor esquerdo: R=140, r=48, centro=145,145) -->
          <path class="tt-wheel-slice slice-anki" data-action="anki"
            d="M 141,5 A 140,140 0 0,0 141,285 L 141,193 A 48,48 0 0,1 141,97 Z" />

          <!-- Right Slice: Explicar com IA (Setor direito) -->
          <path class="tt-wheel-slice slice-ia" data-action="ia"
            d="M 149,5 A 140,140 0 0,1 149,285 L 149,193 A 48,48 0 0,0 149,97 Z" />
        </svg>

        <!-- Slice Content (Left - Anki) -->
        <div class="tt-wheel-item item-anki">
          <span class="tt-wheel-num-badge" title="Tecla 1">1</span>
          ${ICONS.anki}
          <span class="tt-wheel-item-title">Enviar Anki</span>
          <span class="tt-wheel-item-desc">Criar card</span>
        </div>

        <!-- Slice Content (Right - IA) -->
        <div class="tt-wheel-item item-ia">
          <span class="tt-wheel-num-badge" title="Tecla 2">2</span>
          ${ICONS.ai}
          <span class="tt-wheel-item-title">Explicar IA</span>
          <span class="tt-wheel-item-desc">Análise didática</span>
        </div>

        <!-- Center Hub (Apenas ícone minimalista, sem corte de texto) -->
        <div class="tt-wheel-hub" title="Fechar (Esc)">
          <div class="tt-wheel-hub-icon">${ICONS.wheel}</div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // 3. Translucent AI Explanation Modal
    const aiModal = document.createElement('div');
    aiModal.id = 'tec-tools-ai-modal';
    aiModal.innerHTML = `
      <div class="tt-modal-titlebar">
        <div class="tt-traffic-lights">
          <span class="tt-light tt-light-close" title="Fechar (Esc)"></span>
          <span class="tt-light tt-light-min" title="Minimizar"></span>
          <span class="tt-light tt-light-max" title="Expandir"></span>
        </div>
        <div class="tt-modal-header-info">
          <span class="tt-modal-title">TEC-Tools · Explicação com IA</span>
          <span class="tt-modal-badge" id="tt-ai-badge">Carregando...</span>
        </div>
        <div class="tt-modal-actions">
          <button class="tt-action-btn" id="tt-ai-copy-btn" title="Copiar explicação">${ICONS.copy} <span>Copiar</span></button>
          <button class="tt-action-btn" id="tt-ai-refresh-btn" title="Regerar explicação">${ICONS.refresh} <span>Regerar</span></button>
        </div>
      </div>
      <div class="tt-modal-body" id="tt-ai-content">
        <div class="tt-loading-container">
          <div class="tt-apple-spinner"></div>
          <span class="tt-loading-text">Analisando questão e preparando explicação didática...</span>
        </div>
      </div>
    `;
    document.body.appendChild(aiModal);

    // 4. Dynamic Island Toast
    const toast = document.createElement('div');
    toast.id = 'tec-tools-toast';
    toast.innerHTML = `
      <div class="tt-toast-icon success" id="tt-toast-icon">${ICONS.check}</div>
      <span id="tt-toast-msg">Mensagem</span>
    `;
    document.body.appendChild(toast);
  }

  // Bind de eventos de interação
  function bindEvents() {
    const dock = document.getElementById('tec-tools-dock');
    const overlay = document.getElementById('tec-tools-wheel-overlay');
    const wheel = document.getElementById('tec-tools-wheel');
    const hub = wheel.querySelector('.tt-wheel-hub');
    const aiModal = document.getElementById('tec-tools-ai-modal');
    const aiCloseBtn = aiModal.querySelector('.tt-light-close');
    const aiCopyBtn = document.getElementById('tt-ai-copy-btn');
    const aiRefreshBtn = document.getElementById('tt-ai-refresh-btn');

    // Rastreia posição do mouse para abrir a wheel próxima ao ponteiro se desejado
    window.addEventListener('mousemove', (e) => {
      lastMousePos.x = e.clientX;
      lastMousePos.y = e.clientY;
    }, { passive: true });

    // Clique no Dock abre a Wheel centralizada
    dock.addEventListener('click', (e) => {
      e.stopPropagation();
      openWheel();
    });

    // Clique no Hub fecha a Wheel
    hub.addEventListener('click', (e) => {
      if (!overlay.classList.contains('tt-visible')) return;
      e.stopPropagation();
      closeWheel();
    });

    // Clique fora fecha a Wheel
    overlay.addEventListener('click', (e) => {
      if (!overlay.classList.contains('tt-visible')) return;
      if (e.target === overlay) closeWheel();
    });

    // Ações dos setores da Wheel
    wheel.querySelectorAll('.tt-wheel-slice').forEach((slice) => {
      slice.addEventListener('click', (e) => {
        if (!overlay.classList.contains('tt-visible')) return;
        e.stopPropagation();
        const action = slice.getAttribute('data-action');
        closeWheel();
        handleWheelAction(action);
      });
    });

    // Função para comparar tecla com o atalho configurado pelo usuário
    function matchesHotkey(e, cfg) {
      const c = cfg || DEFAULT_HOTKEY;

      const altMatch = Boolean(c.altKey) === e.altKey;
      const ctrlMatch = Boolean(c.ctrlKey) === e.ctrlKey;
      const shiftMatch = Boolean(c.shiftKey) === e.shiftKey;
      const metaMatch = Boolean(c.metaKey) === e.metaKey;

      if (!altMatch || !ctrlMatch || !shiftMatch || !metaMatch) return false;

      // Se o usuário configurou uma tecla única sem modificadores (ex: 'W'), não ativa se estiver digitando em campo de texto
      const target = e.target;
      const isInput = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      );
      const hasModifier = c.altKey || c.ctrlKey || c.metaKey;
      if (isInput && !hasModifier) {
        return false;
      }

      if (c.code && e.code === c.code) return true;
      if (c.key && e.key.toLowerCase() === c.key.toLowerCase()) return true;

      return false;
    }

    // Atalhos do teclado na página do TEC Concursos
    window.addEventListener('keydown', (e) => {
      // 1. Se a Wheel estiver aberta, permite acionar opções imediatamente pelas teclas numéricas (1 a 9)
      if (overlay.classList.contains('tt-visible')) {
        let numKey = null;
        if (e.key >= '1' && e.key <= '9') {
          numKey = e.key;
        } else if (e.code && e.code.startsWith('Digit')) {
          numKey = e.code.slice(5);
        } else if (e.code && e.code.startsWith('Numpad')) {
          numKey = e.code.slice(6);
        }

        if (numKey && ACTION_NUMBERS[numKey]) {
          e.preventDefault();
          e.stopPropagation();
          const action = ACTION_NUMBERS[numKey];
          closeWheel();
          handleWheelAction(action);
          return;
        }
      }

      // 2. Atalho configurável para abrir/fechar a wheel (funciona exclusivamente no tecconcursos.com.br)
      if (matchesHotkey(e, currentConfig?.hotkeyConfig)) {
        e.preventDefault();
        e.stopPropagation();
        if (overlay.classList.contains('tt-visible')) {
          closeWheel();
        } else {
          openWheel();
        }
        return;
      }

      // 3. Tecla Escape para fechar Wheel ou Modal de IA
      if (e.key === 'Escape') {
        if (overlay.classList.contains('tt-visible')) closeWheel();
        if (aiModal.classList.contains('tt-visible')) closeAiModal();
      }
    });

    // Atualiza configurações dinamicamente caso sejam alteradas na aba de Opções
    if (extAPI.storage && extAPI.storage.onChanged) {
      extAPI.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' || area === 'local') {
          extAPI.runtime.sendMessage({ action: 'GET_CONFIG' }).then(res => {
            if (res && res.success && res.config) {
              currentConfig = res.config;
              if (currentConfig.showDockPill === false) {
                dock.classList.add('tt-hidden');
              } else {
                dock.classList.remove('tt-hidden');
              }
            }
          }).catch(() => {});
        }
      });
    }

    // Modal IA: Fechar
    aiCloseBtn.addEventListener('click', closeAiModal);

    // Modal IA: Copiar
    aiCopyBtn.addEventListener('click', () => {
      const text = document.getElementById('tt-ai-content').innerText;
      navigator.clipboard.writeText(text).then(() => {
        showToast('Explicação copiada com sucesso!', 'success');
        const span = aiCopyBtn.querySelector('span');
        const prev = span.textContent;
        span.textContent = 'Copiado!';
        setTimeout(() => { span.textContent = prev; }, 1800);
      });
    });

    // Modal IA: Regerar
    aiRefreshBtn.addEventListener('click', () => {
      if (activeQuestion) {
        requestAiExplanation(activeQuestion);
      }
    });

    // Direct Manipulation: Torna o modal arrastável respeitando o grabOffset (Apple HIG)
    setupDraggableModal(aiModal);

    // Escuta comandos vindos do popup ou do atalho nativo do navegador
    extAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'OPEN_WHEEL') {
        openWheel();
        sendResponse({ success: true });
      } else if (request.action === 'CLOSE_WHEEL') {
        closeWheel();
        sendResponse({ success: true });
      }
    });
  }

  // Abre a Wheel sempre centralizada na tela
  function openWheel() {
    const overlay = document.getElementById('tec-tools-wheel-overlay');
    activeQuestion = extractCurrentQuestion();
    overlay.classList.add('tt-visible');
  }

  function closeWheel() {
    document.getElementById('tec-tools-wheel-overlay').classList.remove('tt-visible');
  }

  function closeAiModal() {
    document.getElementById('tec-tools-ai-modal').classList.remove('tt-visible');
  }

  // Execução de ação da Wheel
  async function handleWheelAction(action) {
    activeQuestion = extractCurrentQuestion();
    if (!activeQuestion) {
      showToast('Nenhuma questão identificada na página.', 'error');
      return;
    }

    if (action === 'anki') {
      await handleSendToAnki(activeQuestion);
    } else if (action === 'ia') {
      handleExplainWithAI(activeQuestion);
    }
  }

  // --------------------------------------------------------------------------
  // Extração Inteligente de Dados da Questão Atual no TEC Concursos
  // --------------------------------------------------------------------------
  function extractCurrentQuestion() {
    // 1. Procura elementos de questão visíveis no DOM
    const questionNodes = Array.from(document.querySelectorAll('.questao, [data-tec-agent-questao-id], .questao-enunciado-texto'));
    if (!questionNodes.length) return null;

    // Encontra a questão com maior visibilidade no centro da tela
    let bestElem = null;
    let minDistance = Infinity;
    const viewCenterY = window.innerHeight / 2;

    for (const node of questionNodes) {
      const container = node.closest('.questao') || node.closest('[data-tec-agent-questao-id]') || node;
      const rect = container.getBoundingClientRect();
      const centerY = rect.top + rect.height / 2;
      const dist = Math.abs(viewCenterY - centerY);

      if (dist < minDistance && rect.height > 60) {
        minDistance = dist;
        bestElem = container;
      }
    }

    if (!bestElem) bestElem = questionNodes[0].closest('.questao') || questionNodes[0];

    // Extrai ID
    let id = bestElem.getAttribute('data-tec-agent-questao-id');
    if (!id) {
      const numElem = bestElem.querySelector('.questao-cabecalho-informacoes-numero, [class*="informacoes-numero"]');
      if (numElem) {
        const m = numElem.textContent.match(/\d[\d.]*/);
        if (m) id = m[0].replace(/\./g, '');
      }
    }
    if (!id) {
      const urlMatch = location.href.match(/questoes\/(\d+)/);
      if (urlMatch) id = urlMatch[1];
    }
    if (!id) id = 'TEC-' + Date.now().toString().slice(-6);

    // Matéria e Assunto
    const matElem = bestElem.querySelector('.questao-cabecalho-informacoes-materia a, .questao-cabecalho-informacoes-materia');
    const materia = matElem ? matElem.textContent.replace(/^Matéria:\s*/i, '').trim() : 'Geral';

    const assElem = bestElem.querySelector('.questao-cabecalho-informacoes-assunto-link, .questao-cabecalho-informacoes-assunto');
    const assunto = assElem ? assElem.textContent.replace(/^Assunto:\s*/i, '').trim() : '';

    // Banca, Órgão, Ano
    let banca = '', orgao = '', ano = '';
    const headerText = bestElem.querySelector('.questao-cabecalho')?.textContent || '';
    const anoMatch = headerText.match(/\b(19\d\d|20\d\d)\b/);
    if (anoMatch) ano = anoMatch[1];

    // Enunciado
    const enunciadoElem = bestElem.querySelector('.questao-enunciado-texto') || bestElem.querySelector('[class*="enunciado-texto"]');
    const enunciado = enunciadoElem ? cleanHtml(enunciadoElem.innerHTML) : 'Enunciado não localizado.';

    // Alternativas
    const altItems = Array.from(bestElem.querySelectorAll('.questao-enunciado-alternativas li, ul[role="radiogroup"] li'));
    let gabaritoLetra = '';
    let gabaritoTexto = '';
    const alternativasList = [];
    const alternativasCompletasList = [];

    altItems.forEach((li, idx) => {
      const letraElem = li.querySelector('.questao-enunciado-alternativa-opcao') || li.querySelector('label');
      let letra = letraElem ? letraElem.textContent.trim().replace(/[:\.\s]/g, '') : String.fromCharCode(65 + idx);
      if (!letra || letra.length > 3) letra = String.fromCharCode(65 + idx);

      const textElem = li.querySelector('.questao-enunciado-alternativa-texto') || li;
      const texto = textElem ? cleanHtml(textElem.innerHTML) : '';

      // Verifica se é o gabarito oficial (classes 'acerto' ou 'correcao' adicionadas pelo TEC)
      const isCorreta = li.classList.contains('acerto') || li.classList.contains('correcao');
      if (isCorreta) {
        gabaritoLetra = letra;
        gabaritoTexto = cleanText(textElem ? textElem.textContent : '');
      }

      alternativasList.push(`<li><b>${letra})</b> ${texto}</li>`);
      alternativasCompletasList.push(`${letra}) ${cleanText(textElem ? textElem.textContent : '')}`);
    });

    // Se o gabarito ainda não foi marcado por 'acerto'/'correcao' (questão ainda não resolvida)
    if (!gabaritoLetra) {
      // Tenta achar alternativa selecionada
      const selecionada = bestElem.querySelector('.questao-enunciado-alternativas li.questao-alternativa-selecionada, .questao-enunciado-alternativas li.erro');
      if (selecionada) {
        const letra = selecionada.querySelector('.questao-enunciado-alternativa-opcao')?.textContent.trim() || '?';
        gabaritoLetra = `${letra} (Selecionada pelo usuário)`;
      }
    }

    // Normalização para Certo / Errado (Cebraspe/CESPE)
    if (gabaritoLetra.toUpperCase() === 'C' && altItems.length === 2) {
      gabaritoLetra = 'Certo (C)';
    } else if (gabaritoLetra.toUpperCase() === 'E' && altItems.length === 2) {
      gabaritoLetra = 'Errado (E)';
    }

    const alternativasHtml = alternativasList.length ? `<ul>${alternativasList.join('')}</ul>` : '';
    const alternativasCompletas = alternativasCompletasList.join('\n');

    return {
      id,
      materia,
      assunto,
      banca,
      orgao,
      ano,
      enunciado,
      alternativasHtml,
      alternativasCompletas,
      gabarito: gabaritoLetra || 'Gabarito oficial pendente (resolva a questão)',
      gabaritoTexto: gabaritoTexto || '',
      url: `https://www.tecconcursos.com.br/questoes/${id}`
    };
  }

  // --------------------------------------------------------------------------
  // 1. Enviar para o Anki
  // --------------------------------------------------------------------------
  async function handleSendToAnki(q) {
    if (!currentConfig) {
      const res = await extAPI.runtime.sendMessage({ action: 'GET_CONFIG' });
      currentConfig = res?.config || {};
    }

    if (q.gabarito.includes('pendente')) {
      showToast('Dica: Resolva a questão no TEC para carregar o gabarito oficial!', 'info');
    }

    // Interpolação de templates com fallbacks seguros
    const replacements = {
      '{{id}}': q.id || '',
      '{{materia}}': q.materia || '',
      '{{assunto}}': q.assunto || '',
      '{{banca}}': q.banca || 'TEC',
      '{{ano}}': q.ano || '',
      '{{orgao}}': q.orgao || '',
      '{{enunciado}}': q.enunciado || '',
      '{{alternativas}}': q.alternativasHtml || '',
      '{{gabarito}}': q.gabarito || '',
      '{{gabarito_texto}}': q.gabaritoTexto || '',
      '{{url}}': q.url || ''
    };

    let front = (currentConfig && currentConfig.ankiTemplateFront) || '';
    let back = (currentConfig && currentConfig.ankiTemplateBack) || '';

    if (!front.trim()) {
      front = `<h3>{{materia}}</h3>\n<h4>{{assunto}}</h4>\n<p><strong>Questão:</strong> {{id}} ({{banca}} / {{ano}} - {{orgao}})</p>\n<div class="enunciado">{{enunciado}}</div>\n<hr>\n<div class="alternativas">{{alternativas}}</div>`;
    }
    if (!back.trim()) {
      back = `<h3>Gabarito: {{gabarito}}</h3>\n<div class="gabarito-texto">{{gabarito_texto}}</div>\n<hr>\n<p><small><a href="{{url}}">Ver no TEC Concursos</a></small></p>`;
    }

    for (const [key, val] of Object.entries(replacements)) {
      front = front.split(key).join(val);
      back = back.split(key).join(val);
    }

    // Garante que a frente e o verso nunca fiquem em branco
    if (!front.trim()) {
      front = q.enunciado || `Questão ${q.id}`;
    }
    if (!back.trim()) {
      back = `Gabarito: ${q.gabarito || 'Não informado'}`;
    }

    showToast('Enviando card para o AnkiConnect...', 'info');

    try {
      const response = await extAPI.runtime.sendMessage({
        action: 'ANKI_ADD_NOTE',
        note: {
          front,
          back,
          enunciado: q.enunciado,
          gabarito: q.gabarito,
          materia: q.materia,
          banca: q.banca
        }
      });

      if (response && response.success) {
        showToast(`✓ Card adicionado ao Anki! [${response.deck}]`, 'success');
      } else {
        showToast(`Erro Anki: ${response.error || 'Falha ao conectar'}`, 'error');
      }
    } catch (err) {
      showToast(`Erro ao comunicar com o Anki: ${err.message}`, 'error');
    }
  }

  // --------------------------------------------------------------------------
  // 2. Explicar com IA
  // --------------------------------------------------------------------------
  function handleExplainWithAI(q) {
    const modal = document.getElementById('tec-tools-ai-modal');
    const badge = document.getElementById('tt-ai-badge');
    const content = document.getElementById('tt-ai-content');

    badge.textContent = `Q.${q.id} · ${q.materia}`;
    content.innerHTML = `
      <div class="tt-loading-container">
        <div class="tt-apple-spinner"></div>
        <span class="tt-loading-text">Consultando IA e estruturando explicação didática...</span>
      </div>
    `;

    modal.classList.add('tt-visible');
    requestAiExplanation(q);
  }

  function requestAiExplanation(q) {
    const content = document.getElementById('tt-ai-content');
    const badge = document.getElementById('tt-ai-badge');

    let fullText = '';
    let hasStarted = false;

    // Conecta à porta de streaming de IA
    const port = extAPI.runtime.connect({ name: 'AI_STREAM_CHANNEL' });

    port.postMessage({
      action: 'START_AI_STREAM',
      question: {
        id: q.id,
        materia: q.materia,
        assunto: q.assunto,
        banca: q.banca,
        ano: q.ano,
        orgao: q.orgao,
        enunciado: cleanText(q.enunciado),
        alternativasCompletas: q.alternativasCompletas,
        gabarito: q.gabarito,
        gabaritoTexto: q.gabaritoTexto,
        url: q.url
      }
    });

    port.onMessage.addListener((msg) => {
      if (msg.type === 'CHUNK') {
        if (!hasStarted) {
          hasStarted = true;
          content.innerHTML = '';
          badge.textContent = `Q.${q.id} · ${q.materia} (Transmitindo...)`;
        }
        fullText += msg.chunk;
        content.innerHTML = renderMarkdown(fullText);
        content.scrollTop = content.scrollHeight;
      } else if (msg.type === 'DONE') {
        badge.textContent = `Q.${q.id} · ${q.materia}`;
        try { port.disconnect(); } catch {}
      } else if (msg.type === 'ERROR') {
        badge.textContent = 'Erro';
        content.innerHTML = `
          <div style="padding: 24px; text-align: center; color: #ff6b6b;">
            <p><strong>Não foi possível gerar a explicação:</strong></p>
            <p style="margin-top: 8px;">${escapeHtml(msg.error || 'Erro desconhecido')}</p>
            <p style="margin-top: 14px; font-size: 12px; color: rgba(255,255,255,0.7);">
              Verifique sua chave de API e configurações no menu de opções da extensão.
            </p>
          </div>
        `;
        try { port.disconnect(); } catch {}
      }
    });

    port.onDisconnect.addListener(() => {
      if (!hasStarted && !content.innerHTML.includes('Não foi possível')) {
        content.innerHTML = `
          <div style="padding: 24px; text-align: center; color: #ff6b6b;">
            <p><strong>Canal de streaming desconectado.</strong></p>
          </div>
        `;
      }
    });
  }

  // --------------------------------------------------------------------------
  // Direct Manipulation: Arraste de Janela Suave (Apple Fluid Motion)
  // --------------------------------------------------------------------------
  function setupDraggableModal(modal) {
    const titlebar = modal.querySelector('.tt-modal-titlebar');
    let isDragging = false;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;

    titlebar.addEventListener('pointerdown', (e) => {
      // Ignora clique em botões da barra de títulos
      if (e.target.closest('button') || e.target.closest('.tt-light')) return;

      isDragging = true;
      titlebar.setPointerCapture(e.pointerId);

      const rect = modal.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      initialLeft = rect.left;
      initialTop = rect.top;

      modal.style.right = 'auto';
      modal.style.bottom = 'auto';
      modal.style.left = `${initialLeft}px`;
      modal.style.top = `${initialTop}px`;
      modal.style.transition = 'none';
    });

    titlebar.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      modal.style.left = `${initialLeft + dx}px`;
      modal.style.top = `${initialTop + dy}px`;
    });

    const stopDrag = (e) => {
      if (!isDragging) return;
      isDragging = false;
      modal.style.transition = '';
      try { titlebar.releasePointerCapture(e.pointerId); } catch {}
    };

    titlebar.addEventListener('pointerup', stopDrag);
    titlebar.addEventListener('pointercancel', stopDrag);
  }

  // --------------------------------------------------------------------------
  // Helpers de Formatação e Notificação
  // --------------------------------------------------------------------------
  let toastTimer = null;
  function showToast(msg, type = 'info') {
    const toast = document.getElementById('tec-tools-toast');
    const msgEl = document.getElementById('tt-toast-msg');
    const iconEl = document.getElementById('tt-toast-icon');

    msgEl.textContent = msg;
    iconEl.className = `tt-toast-icon ${type}`;
    iconEl.innerHTML = type === 'success' ? ICONS.check : (type === 'error' ? '✕' : 'ℹ');

    toast.classList.add('tt-toast-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('tt-toast-visible');
    }, 3800);
  }

  function cleanHtml(html) {
    if (!html) return '';
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function cleanText(text) {
    if (!text) return '';
    return text.replace(/\s+/g, ' ').trim();
  }

  function escapeHtml(str) {
    return str.replace(/[&<>'"]/g, tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag));
  }

  // Parser minimalista e rápido de Markdown para a explicação didática
  function renderMarkdown(md) {
    if (!md) return '';
    let html = escapeHtml(md);

    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Bold & Italic
    html = html.replace(/\*\*\*(.*?)\*\*\*/gim, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>');

    // Blockquotes
    html = html.replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>');

    // Code blocks & inline code
    html = html.replace(/```([\s\S]*?)```/gim, '<pre><code>$1</code></pre>');
    html = html.replace(/`([^`]+)`/gim, '<code>$1</code>');

    // Lists
    html = html.replace(/^\s*-\s+(.*$)/gim, '<li>$1</li>');
    html = html.replace(/^\s*\d+\.\s+(.*$)/gim, '<li>$1</li>');
    html = html.replace(/(<li>[\s\S]*?<\/li>)/gim, '<ul>$1</ul>');
    html = html.replace(/<\/ul>\s*<ul>/gim, '');

    // Paragraphs
    html = html.split('\n\n').map(p => {
      p = p.trim();
      if (!p || p.startsWith('<h') || p.startsWith('<ul') || p.startsWith('<pre') || p.startsWith('<blockquote')) {
        return p;
      }
      return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    }).join('');

    return html;
  }

  // Inicializa quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
