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
    altKey: false,
    ctrlKey: false,
    shiftKey: false,
    metaKey: false,
    code: 'KeyA',
    key: 'a',
    display: 'A'
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
    ensurePageBridge();
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
    dock.title = 'TEC-Tools (A)';
    if (currentConfig && currentConfig.showDockPill === false) {
      dock.classList.add('tt-hidden');
    }
    dock.innerHTML = `<div class="tt-dock-icon">${ICONS.wheel}</div>`;
    document.body.appendChild(dock);

    // 2. Wheel Overlay & Radial Donut Menu (Sempre centralizada, sem cortes)
    const overlay = document.createElement('div');
    overlay.id = 'tec-tools-wheel-overlay';
    overlay.innerHTML = `
      <div id="tec-tools-wheel">
        <svg class="tt-wheel-svg" viewBox="0 0 320 320">
          <defs>
            <linearGradient id="ttGradAnki" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#0071e3" stop-opacity="0.9"/>
              <stop offset="100%" stop-color="#0051a8" stop-opacity="0.9"/>
            </linearGradient>
            <linearGradient id="ttGradIA" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#af52de" stop-opacity="0.9"/>
              <stop offset="100%" stop-color="#7c2ea8" stop-opacity="0.9"/>
            </linearGradient>
          </defs>

          <!-- Left Slice: Enviar para Anki (Setor esquerdo: R=154, r=44, centro=160,160) -->
          <path class="tt-wheel-slice slice-anki" data-action="anki"
            d="M 156,6 A 154,154 0 0,0 156,314 L 156,204 A 44,44 0 0,1 156,116 Z" />

          <!-- Right Slice: Explicar com IA (Setor direito) -->
          <path class="tt-wheel-slice slice-ia" data-action="ia"
            d="M 164,6 A 154,154 0 0,1 164,314 L 164,204 A 44,44 0 0,0 164,116 Z" />
        </svg>

        <!-- Slice Content (Left - Anki) -->
        <div class="tt-wheel-item item-anki">
          ${ICONS.anki}
          <span class="tt-wheel-item-title">Enviar ao Anki</span>
          <div class="tt-wheel-key-badge" title="Pressione 1">1</div>
        </div>

        <!-- Slice Content (Right - IA) -->
        <div class="tt-wheel-item item-ia">
          ${ICONS.ai}
          <span class="tt-wheel-item-title">Explicar com IA</span>
          <div class="tt-wheel-key-badge" title="Pressione 2">2</div>
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
        <div class="tt-modal-header-info">
          <span class="tt-modal-title">TEC-Tools · Explicação com IA</span>
          <span class="tt-modal-badge" id="tt-ai-badge">Carregando...</span>
        </div>
        <div class="tt-modal-actions">
          <button class="tt-action-btn" id="tt-ai-copy-btn" title="Copiar explicação">${ICONS.copy} <span>Copiar</span></button>
          <button class="tt-action-btn" id="tt-ai-refresh-btn" title="Regerar explicação">${ICONS.refresh} <span>Regerar</span></button>
          <button class="tt-close-btn" id="tt-ai-close-btn" title="Fechar (Esc)">✕</button>
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
    const aiCloseBtn = document.getElementById('tt-ai-close-btn');
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

    // Modal IA: Copiar com formatação completa (HTML rico + Plain text Markdown)
    aiCopyBtn.addEventListener('click', async () => {
      const content = document.getElementById('tt-ai-content');
      if (content.querySelector('.tt-loading-container')) {
        showToast('Aguarde a explicação ser gerada...', 'info');
        return;
      }

      const rawMarkdown = content.dataset.rawMarkdown || '';
      const html = content.innerHTML;
      const plainText = rawMarkdown || content.innerText || '';

      if (!plainText.trim()) {
        showToast('Nenhuma explicação para copiar.', 'warning');
        return;
      }

      let copied = false;
      const styledHtml = prepareHtmlForClipboard(html);

      // 1. API Moderna ClipboardItem (preserva formatação rica em Docs, Word, Anki, Notion)
      if (navigator.clipboard && window.ClipboardItem) {
        try {
          const blobHtml = new Blob([styledHtml], { type: 'text/html' });
          const blobText = new Blob([plainText], { type: 'text/plain' });
          await navigator.clipboard.write([
            new ClipboardItem({
              'text/html': blobHtml,
              'text/plain': blobText
            })
          ]);
          copied = true;
        } catch (err) {
          console.warn('ClipboardItem error, tentando fallback:', err);
        }
      }

      // 2. Fallback de seleção no DOM com execCommand (copia HTML e texto nativamente)
      if (!copied) {
        try {
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(content);
          selection.removeAllRanges();
          selection.addRange(range);
          copied = document.execCommand('copy');
          selection.removeAllRanges();
        } catch (err) {
          console.warn('execCommand copy fallback error:', err);
        }
      }

      // 3. Fallback de texto puro
      if (!copied) {
        try {
          await navigator.clipboard.writeText(plainText);
          copied = true;
        } catch (err) {}
      }

      if (copied) {
        showToast('Explicação copiada com formatação!', 'success');
        const span = aiCopyBtn.querySelector('span');
        if (span) {
          const prev = span.textContent;
          span.textContent = 'Copiado!';
          setTimeout(() => { span.textContent = prev; }, 1800);
        }
      } else {
        showToast('Não foi possível copiar.', 'error');
      }
    });

    // Modal IA: Regerar
    aiRefreshBtn.addEventListener('click', () => {
      if (activeQuestion) {
        requestAiExplanation(activeQuestion);
      }
    });

    // Direct Manipulation: Torna o modal arrastável respeitando o grabOffset (Apple HIG)
    setupDraggableModal(aiModal);

    // Mantém o modal dentro do viewport se a janela for redimensionada
    window.addEventListener('resize', () => {
      if (!aiModal.classList.contains('tt-visible')) return;
      const rect = aiModal.getBoundingClientRect();
      if (rect.top < 10) aiModal.style.top = '10px';
      if (rect.left > window.innerWidth - 100) {
        aiModal.style.left = `${Math.max(16, window.innerWidth - rect.width - 16)}px`;
      }
    });

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
      await handleExplainWithAI(activeQuestion);
    }
  }

  // --------------------------------------------------------------------------
  // Ponte de Execução no Contexto da Página (Main World Bridge)
  // Executa requisições como o próprio tecconcursos.com.br, enviando a sessão
  // ativa (JSESSIONID) e herdando a mesma origem do site.
  // --------------------------------------------------------------------------
  function ensurePageBridge() {
    if (document.getElementById('tt-page-bridge')) return;
    const script = document.createElement('script');
    script.id = 'tt-page-bridge';
    script.textContent = `
      (function() {
        if (window.__TT_PAGE_BRIDGE_INITIALIZED__) return;
        window.__TT_PAGE_BRIDGE_INITIALIZED__ = true;

        window.addEventListener('message', async function(event) {
          if (event.source !== window) return;
          if (event.origin !== window.location.origin) return;
          const msg = event.data;
          if (!msg || typeof msg !== 'object') return;

          // Fetch com as credenciais nativas da página (JSESSIONID, Cookies de sessão)
          if (msg.type === 'TT_PAGE_FETCH_REQ') {
            var requestId = msg.requestId;
            var url = msg.url;
            var method = msg.method || 'GET';
            var headers = msg.headers || {
              'Accept': 'application/json, text/plain, */*',
              'X-Requested-With': 'XMLHttpRequest',
              'Logado': 'true'
            };

            try {
              var res = await window.fetch(url, {
                method: method,
                credentials: 'include',
                headers: headers
              });

              var data = null;
              var text = '';
              try {
                text = await res.text();
                data = JSON.parse(text);
              } catch (parseErr) {
                data = null;
              }

              window.postMessage({
                type: 'TT_PAGE_FETCH_RES',
                requestId: requestId,
                ok: res.ok,
                status: res.status,
                data: data,
                text: text
              }, window.location.origin);
            } catch (fetchErr) {
              window.postMessage({
                type: 'TT_PAGE_FETCH_RES',
                requestId: requestId,
                ok: false,
                status: 0,
                error: fetchErr.message
              }, window.location.origin);
            }
          }
        });
      })();
    `;
    (document.head || document.documentElement).appendChild(script);
  }

  function pageFetch(url, options = {}) {
    ensurePageBridge();

    return new Promise((resolve, reject) => {
      const requestId = 'tt_req_' + Math.random().toString(36).slice(2) + Date.now();
      let done = false;

      const timeout = setTimeout(() => {
        if (done) return;
        done = true;
        window.removeEventListener('message', handleMessage);
        reject(new Error('Timeout ao requisitar API via contexto da página'));
      }, 7000);

      function handleMessage(event) {
        if (event.source !== window) return;
        if (event.origin !== window.location.origin) return;
        const msg = event.data;
        if (msg && msg.type === 'TT_PAGE_FETCH_RES' && msg.requestId === requestId) {
          if (done) return;
          done = true;
          clearTimeout(timeout);
          window.removeEventListener('message', handleMessage);
          resolve(msg);
        }
      }

      window.addEventListener('message', handleMessage);

      window.postMessage({
        type: 'TT_PAGE_FETCH_REQ',
        requestId: requestId,
        url: url,
        method: options.method || 'GET',
        headers: options.headers || null
      }, window.location.origin);
    });
  }

  // --------------------------------------------------------------------------
  // Ponte de Contexto com a Página (Lê window.vm e window.jsonCaderno com segurança)
  // --------------------------------------------------------------------------
  function getPageContextBridge() {
    // 1. Acesso direto seguro pelo Firefox WebExtensions via wrappedJSObject
    if (typeof window !== 'undefined' && window.wrappedJSObject) {
      try {
        const w = window.wrappedJSObject;
        const q = w.vm?.questao || w.vmQuestao?.questao;
        const c = w.vm?.caderno || w.jsonCaderno;
        if (q && q.idQuestao) {
          return {
            idQuestao: String(q.idQuestao),
            idCaderno: c?.idCaderno ? String(c.idCaderno) : null,
            numeroQuestaoAtual: c?.numeroQuestaoAtual ? Number(c.numeroQuestaoAtual) : null,
            enunciado: q.enunciado || null,
            gabarito: q.numeroAlternativaCorreta != null ? q.numeroAlternativaCorreta : null,
            alternativas: q.alternativas || null,
            banca: q.bancaSigla || q.nomeBanca || null,
            orgao: q.orgaoSigla || q.nomeOrgao || null,
            ano: q.concursoAno || q.ano || null,
            materia: q.nomeMateria || null,
            assunto: q.nomeAssunto || null
          };
        }
        if (c && c.idCaderno) {
          return {
            idQuestao: null,
            idCaderno: String(c.idCaderno),
            numeroQuestaoAtual: c.numeroQuestaoAtual ? Number(c.numeroQuestaoAtual) : null
          };
        }
      } catch {}
    }

    // 2. Fallback de injeção síncrona de script para outros navegadores
    try {
      const s = document.createElement('script');
      s.textContent = `
        (function() {
          try {
            var q = (window.vm && window.vm.questao) || (window.vmQuestao && window.vmQuestao.questao);
            var c = (window.vm && window.vm.caderno) || window.jsonCaderno;
            var data = {
              idQuestao: q && q.idQuestao ? String(q.idQuestao) : null,
              idCaderno: c && c.idCaderno ? String(c.idCaderno) : null,
              numeroQuestaoAtual: c && c.numeroQuestaoAtual ? Number(c.numeroQuestaoAtual) : null,
              enunciado: q ? q.enunciado : null,
              gabarito: q ? q.numeroAlternativaCorreta : null,
              alternativas: q ? q.alternativas : null,
              banca: q ? (q.bancaSigla || q.nomeBanca) : null,
              orgao: q ? (q.orgaoSigla || q.nomeOrgao) : null,
              ano: q ? (q.concursoAno || q.ano) : null,
              materia: q ? q.nomeMateria : null,
              assunto: q ? q.nomeAssunto : null
            };
            document.documentElement.setAttribute('data-tt-page-ctx', JSON.stringify(data));
          } catch(e) {}
        })();
      `;
      (document.head || document.documentElement).appendChild(s);
      s.remove();
      const raw = document.documentElement.getAttribute('data-tt-page-ctx');
      document.documentElement.removeAttribute('data-tt-page-ctx');
      if (raw) return JSON.parse(raw);
    } catch {}

    return null;
  }

  function formatGabarito(num, alts) {
    if (num == null) return 'Gabarito oficial pendente (resolva a questão)';
    if (typeof num === 'string' && isNaN(parseInt(num, 10))) return num;
    const n = parseInt(num, 10);
    if (Array.isArray(alts) && alts.length === 2) {
      if (n === 1) return 'Certo (C)';
      if (n === 2) return 'Errado (E)';
    }
    if (n >= 1 && n <= 26) {
      return String.fromCharCode(64 + n);
    }
    return String(num);
  }

  // Garante que o objeto da questão possua o ID real de banco de dados (especialmente em cadernos)
  async function ensureRealQuestionData(q) {
    if (!q) return;

    // Se já é um ID numérico real válido (5 a 9 dígitos, >= 10000)
    const isRealId = q.id && /^\d{5,9}$/.test(q.id) && parseInt(q.id, 10) >= 10000;
    if (isRealId && q.enunciado && q.enunciado !== 'Enunciado não localizado.') {
      return;
    }

    // Tenta obter do bridge de contexto da página
    const bridge = getPageContextBridge();
    if (bridge && bridge.idQuestao && /^\d{5,9}$/.test(bridge.idQuestao)) {
      q.id = String(bridge.idQuestao);
      q.url = `https://www.tecconcursos.com.br/questoes/${q.id}`;
      if (bridge.enunciado && (!q.enunciado || q.enunciado === 'Enunciado não localizado.')) {
        q.enunciado = cleanHtml(bridge.enunciado);
      }
      if (bridge.materia && (!q.materia || q.materia === 'Geral')) q.materia = bridge.materia;
      if (bridge.assunto && !q.assunto) q.assunto = bridge.assunto;
      if (bridge.banca && (!q.banca || q.banca === 'TEC')) q.banca = bridge.banca;
      if (bridge.orgao && !q.orgao) q.orgao = bridge.orgao;
      if (bridge.ano && !q.ano) q.ano = String(bridge.ano);
      if (bridge.gabarito != null && q.gabarito.includes('pendente')) {
        q.gabarito = formatGabarito(bridge.gabarito, bridge.alternativas);
      }
      return;
    }

    // Se estiver em um caderno, consulta a API do caderno para resolver a questão atual
    const cadernoId = q.cadernoId || bridge?.idCaderno || (location.pathname.match(/\/cadernos\/(\d+)/i)?.[1]);
    const pos = q.cadernoPos || bridge?.numeroQuestaoAtual || 1;

    if (cadernoId) {
      try {
        let data = null;
        const endpoint = `/api/cadernos/${cadernoId}/questoes/${pos}?atualizarCronometro=false`;

        // 1. Tenta via bridge no contexto da página (com sessão/cookies JSESSIONID)
        try {
          const pageRes = await pageFetch(endpoint);
          if (pageRes && pageRes.ok && pageRes.data) {
            data = pageRes.data;
          }
        } catch {}

        // 2. Fallback de fetch direto do content script
        if (!data) {
          const res = await fetch(endpoint, {
            credentials: 'include',
            headers: {
              'Accept': 'application/json, text/plain, */*',
              'X-Requested-With': 'XMLHttpRequest',
              'Logado': 'true'
            }
          });
          if (res.ok) {
            data = await res.json();
          }
        }

        if (data) {
          const qData = data?.questao;
          if (qData && qData.idQuestao) {
            q.id = String(qData.idQuestao);
            q.url = `https://www.tecconcursos.com.br/questoes/${q.id}`;
            if (qData.enunciado) q.enunciado = cleanHtml(qData.enunciado);
            if (qData.nomeMateria) q.materia = qData.nomeMateria;
            if (qData.nomeAssunto) q.assunto = qData.nomeAssunto;
            if (qData.bancaSigla || qData.nomeBanca) q.banca = qData.bancaSigla || qData.nomeBanca;
            if (qData.orgaoSigla || qData.nomeOrgao) q.orgao = qData.orgaoSigla || qData.nomeOrgao;
            if (qData.concursoAno) q.ano = String(qData.concursoAno);
            if (qData.numeroAlternativaCorreta != null) {
              q.gabarito = formatGabarito(qData.numeroAlternativaCorreta, qData.alternativas);
            }
            if (Array.isArray(qData.alternativas) && qData.alternativas.length > 0 && (!q.alternativasHtml || !q.alternativasCompletas)) {
              const list = [];
              const comp = [];
              qData.alternativas.forEach((alt, idx) => {
                const letra = String.fromCharCode(65 + idx);
                const txt = cleanHtml(alt);
                list.push(`<li><b>${letra})</b> ${txt}</li>`);
                comp.push(`${letra}) ${cleanText(txt)}`);
              });
              if (!q.alternativasHtml) q.alternativasHtml = `<ul>${list.join('')}</ul>`;
              if (!q.alternativasCompletas) q.alternativasCompletas = comp.join('\n');
            }
            return;
          }
        }
      } catch (err) {
        console.warn('[TEC-Tools] Falha ao resolver questão via API do caderno:', err);
      }
    }

    // Se ainda não tiver ID após todas as tentativas
    if (!q.id || !/^\d{5,9}$/.test(q.id)) {
      q.id = 'TEC-' + Date.now().toString().slice(-6);
      q.url = `https://www.tecconcursos.com.br/questoes/${q.id}`;
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

    // Detecta contexto da página (window.vm e window.jsonCaderno)
    const pageCtx = getPageContextBridge();
    const isCadernoUrl = /\/questoes\/cadernos\/(\d+)/i.test(location.pathname);
    let cadernoId = pageCtx?.idCaderno || null;
    if (!cadernoId) {
      const cMatch = location.pathname.match(/\/cadernos\/(\d+)/i);
      if (cMatch) cadernoId = cMatch[1];
    }

    // Posição no caderno (ex: "Questão 1 de 50" -> pos = 1)
    let cadernoPos = pageCtx?.numeroQuestaoAtual || null;
    const numElem = bestElem.querySelector('.questao-cabecalho-informacoes-numero, [class*="informacoes-numero"]');
    if (numElem) {
      const posMatch = numElem.textContent.match(/(\d+)\s+de\s+\d+/i);
      if (posMatch) {
        cadernoPos = parseInt(posMatch[1], 10);
      }
    }

    // Extrai ID real de banco de dados
    let id = null;

    // 1. Bridge de contexto da página
    if (pageCtx && pageCtx.idQuestao && /^\d{5,9}$/.test(pageCtx.idQuestao)) {
      id = String(pageCtx.idQuestao);
    }

    // 2. Atributo data-tec-agent-questao-id
    if (!id) {
      const rawAttr = bestElem.getAttribute('data-tec-agent-questao-id') ||
                      bestElem.closest('[data-tec-agent-questao-id]')?.getAttribute('data-tec-agent-questao-id');
      if (rawAttr && /^\d{5,9}$/.test(rawAttr)) {
        id = rawAttr;
      }
    }

    // 3. IDs dos parágrafos do enunciado (ex: id="02271374Q-b5d1222f-...")
    if (!id) {
      const qEl = bestElem.querySelector('[id*="Q-"]');
      if (qEl && qEl.id) {
        const qm = qEl.id.match(/^0?(\d{5,9})Q-[a-zA-Z0-9_-]+/);
        if (qm) id = qm[1];
      }
      if (!id) {
        const qm2 = bestElem.innerHTML.match(/\bid=["']0?(\d{5,9})Q-[a-zA-Z0-9_-]+/);
        if (qm2) id = qm2[1];
      }
    }

    // 4. Links para a questão standalone dentro do card
    if (!id) {
      const linkEl = bestElem.querySelector('a[href*="/questoes/"]:not([href*="/cadernos/"]):not([href*="/pastas/"]):not([href*="/filtrar"]):not([href*="/favoritas"]):not([href*="/discussao"])');
      if (linkEl) {
        const lm = linkEl.href.match(/\/questoes\/(\d{5,9})\b/);
        if (lm) id = lm[1];
      }
    }

    // 5. URL da página (apenas se for página standalone de questão, nunca em caderno)
    if (!id && !isCadernoUrl) {
      const urlMatch = location.pathname.match(/^\/questoes\/(\d{5,9})\b/);
      if (urlMatch) id = urlMatch[1];
    }

    // 6. Texto do cabeçalho SOMENTE se for número de questão standalone (SEM "de")
    if (!id && numElem) {
      const hasDe = /(\d+)\s+de\s+\d+/i.test(numElem.textContent);
      if (!hasDe) {
        const m = numElem.textContent.match(/\b(\d{5,9})\b/);
        if (m) id = m[1];
      }
    }

    // Se ainda não foi resolvido e não estamos em caderno, fallback seguro
    if (!id && !cadernoId) {
      id = 'TEC-' + Date.now().toString().slice(-6);
    }

    // Matéria e Assunto
    let materia = pageCtx?.materia || '';
    if (!materia) {
      const matElem = bestElem.querySelector('.questao-cabecalho-informacoes-materia a, .questao-cabecalho-informacoes-materia');
      materia = matElem ? matElem.textContent.replace(/^[\s\u00A0]*Mat[eé]ria:?[\s\u00A0]*/i, '').trim() : 'Geral';
    }

    let assunto = pageCtx?.assunto || '';
    if (!assunto) {
      const assElem = bestElem.querySelector('.questao-cabecalho-informacoes-assunto-link, .questao-cabecalho-informacoes-assunto');
      assunto = assElem ? assElem.textContent.replace(/^[\s\u00A0]*Assunto:?[\s\u00A0]*/i, '').trim() : '';
    }

    // Banca, Órgão, Ano
    let banca = pageCtx?.banca || '';
    let orgao = pageCtx?.orgao || '';
    let ano = pageCtx?.ano ? String(pageCtx.ano) : '';
    const headerText = bestElem.querySelector('.questao-cabecalho')?.textContent || '';
    if (!ano) {
      const anoMatch = headerText.match(/\b(19\d\d|20\d\d)\b/);
      if (anoMatch) ano = anoMatch[1];
    }

    // Enunciado
    const enunciadoElem = bestElem.querySelector('.questao-enunciado-texto') || bestElem.querySelector('[class*="enunciado-texto"]');
    let enunciado = enunciadoElem ? cleanHtml(enunciadoElem.innerHTML) : '';
    if (!enunciado && pageCtx?.enunciado) {
      enunciado = cleanHtml(pageCtx.enunciado);
    }
    if (!enunciado) enunciado = 'Enunciado não localizado.';

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
      if (pageCtx?.gabarito != null) {
        gabaritoLetra = formatGabarito(pageCtx.gabarito, pageCtx.alternativas || altItems);
      } else {
        const selecionada = bestElem.querySelector('.questao-enunciado-alternativas li.questao-alternativa-selecionada, .questao-enunciado-alternativas li.erro');
        if (selecionada) {
          const letra = selecionada.querySelector('.questao-enunciado-alternativa-opcao')?.textContent.trim() || '?';
          gabaritoLetra = `${letra} (Selecionada pelo usuário)`;
        }
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
      element: bestElem,
      id: id || '',
      cadernoId,
      cadernoPos,
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
      url: id && /^\d{5,9}$/.test(id) ? `https://www.tecconcursos.com.br/questoes/${id}` : location.href
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

    // Garante que o ID e dados da questão estejam resolvidos (especialmente em cadernos)
    await ensureRealQuestionData(q);

    if (q.gabarito.includes('pendente')) {
      showToast('Dica: Resolva a questão no TEC para carregar o gabarito oficial!', 'info');
    }

    let front = (currentConfig && currentConfig.ankiTemplateFront) || '';
    let back = (currentConfig && currentConfig.ankiTemplateBack) || '';

    if (!front.trim()) {
      front = `<h3>{{materia}}</h3>\n<h4>{{assunto}}</h4>\n<p><strong>Questão:</strong> {{id}} ({{banca}} / {{ano}} - {{orgao}})</p>\n<div class="enunciado">{{enunciado}}</div>\n<hr>\n<div class="alternativas">{{alternativas}}</div>`;
    }
    if (!back.trim()) {
      back = `<h3>Gabarito: {{gabarito}}</h3>\n<div class="gabarito-texto">{{gabarito_texto}}</div>\n<hr>\n<p><small><a href="{{url}}">Ver no TEC Concursos</a></small></p>`;
    }

    // Comentários: {{comentario}} (professor) e {{comentario_forum}} (top fórum)
    const combinedTemplates = (front || '') + (back || '');
    const hasTeacherVar = /\{\{(?:comentario|comentario_professor|comentario-professor)\}\}/i.test(combinedTemplates);
    const hasForumVar = /\{\{(?:comentario_forum|comentario-forum|comentario_alunos|comentarios_alunos|forum)\}\}/i.test(combinedTemplates);

    let comentarioHtml = '';
    if (hasTeacherVar) {
      comentarioHtml = await fetchTeacherComment(q.id, q.element, q.cadernoId);
    }

    let comentarioForumHtml = '';
    if (hasForumVar) {
      comentarioForumHtml = await fetchTopForumComment(q.id, q.element);
    }

    // Interpolação de templates com suporte a todas as variações de tags
    const replacements = {
      'id': q.id || '',
      'materia': q.materia || '',
      'assunto': q.assunto || '',
      'banca': q.banca || 'TEC',
      'ano': q.ano || '',
      'orgao': q.orgao || '',
      'enunciado': q.enunciado || '',
      'alternativas': q.alternativasHtml || '',
      'alternativas_completas': q.alternativasCompletas || '',
      'gabarito': q.gabarito || '',
      'gabarito_texto': q.gabaritoTexto || '',
      'comentario': comentarioHtml,
      'comentario_professor': comentarioHtml,
      'comentario-professor': comentarioHtml,
      'comentario_forum': comentarioForumHtml,
      'comentario-forum': comentarioForumHtml,
      'comentario_alunos': comentarioForumHtml,
      'comentarios_alunos': comentarioForumHtml,
      'forum': comentarioForumHtml,
      'url': q.url || ''
    };

    for (const [tag, val] of Object.entries(replacements)) {
      const reg = new RegExp(`\\{\\{${tag}\\}\\}`, 'gi');
      front = front.replace(reg, () => val);
      back = back.replace(reg, () => val);
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

  // 1. Comentário do Professor ({{comentario}})
  async function fetchTeacherComment(questionId, questionElem, cadernoId) {
    if (questionId && /^\d+$/.test(questionId)) {
      const endpoints = [
        `/api/questoes/${questionId}/comentario`,
        cadernoId ? `/api/caderno-aberto/${cadernoId}/questao/${questionId}/comentario` : null,
        cadernoId ? `/api/cadernos/${cadernoId}/questao/${questionId}/comentario` : null
      ].filter(Boolean);

      const reqHeaders = {
        'Accept': 'application/json, text/plain, */*',
        'X-Requested-With': 'XMLHttpRequest',
        'Logado': 'true'
      };

      for (const url of endpoints) {
        // 1. Tenta via bridge no contexto da página (com sessão JSESSIONID da aba ativa)
        try {
          const pageRes = await pageFetch(url, { headers: reqHeaders });
          if (pageRes && pageRes.ok && pageRes.data) {
            const data = pageRes.data;
            const html = data?.comentario?.textoComentario || data?.comentarioIA?.textoComentario || '';
            if (html && html.trim().length > 10) return normalizeAssets(html);
          }
        } catch {}

        // 2. Fallback de fetch direto do content script
        try {
          const res = await fetch(url, {
            credentials: 'include',
            headers: reqHeaders
          });
          if (res.ok) {
            const data = await res.json();
            const html = data?.comentario?.textoComentario || data?.comentarioIA?.textoComentario || '';
            if (html && html.trim().length > 10) return normalizeAssets(html);
          }
        } catch {}
      }
    }

    // Fallback: extração do comentário do professor direto do DOM caso esteja aberto na tela
    try {
      const root = (questionElem && questionElem.querySelector && (questionElem.querySelector('.questao-complementos, [class*="comentario-professor"]') || questionElem)) || document;
      const teacherEl = root.querySelector(
        '.questao-comentario-professor-texto, .comentario-texto-professor, [ng-bind-html*="textoComentario"], .comentario-professor-corpo'
      );
      if (teacherEl && teacherEl.innerHTML.trim().length > 20 && !/^ito:\s*/i.test(teacherEl.textContent.trim())) {
        return normalizeAssets(teacherEl.innerHTML);
      }
    } catch {}

    return '';
  }

  // 2. Comentário com mais upvotes do Fórum ({{comentario_forum}})
  async function fetchTopForumComment(questionId, questionElem) {
    // Prioridade 1: API oficial do TEC Concursos (ordenado por mais votados no backend)
    if (questionId && /^\d+$/.test(questionId)) {
      const apiHtml = await fetchTopForumCommentFromAPI(questionId);
      if (apiHtml) return normalizeAssets(apiHtml);
    }

    // Prioridade 2: Fallback para o DOM se a API falhar ou a questão estiver aberta localmente
    const domHtml = getTopForumCommentFromDOM(questionElem);
    if (domHtml) return normalizeAssets(domHtml);

    return '';
  }

  // Consulta na API interna do fórum da questão ordenando por pontos (rota oficial do TEC)
  // com fallback para ordenação por data e classificação por maior saldo de votos positivos
  async function fetchTopForumCommentFromAPI(questionId) {
    const endpoints = [
      `/api/discussoes/${questionId}/comentarios-alunos?ordenarPor=pontos&pagina=1`,
      `/api/discussoes/${questionId}/comentarios-alunos?ordenarPor=pontos`,
      `/api/discussoes/${questionId}/comentarios-alunos?ordenarPor=data&pagina=1`,
      `/api/discussoes/${questionId}/comentarios-alunos?ordenarPor=data`,
      `/api/discussoes/${questionId}/comentarios-alunos`
    ];

    const reqHeaders = {
      'Accept': 'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest',
      'Logado': 'true'
    };

    for (const url of endpoints) {
      let data = null;

      // 1. Tenta via bridge no contexto da página (com sessão JSESSIONID da aba ativa)
      try {
        const pageRes = await pageFetch(url, { headers: reqHeaders });
        if (pageRes && pageRes.ok && pageRes.data) {
          data = pageRes.data;
        }
      } catch {}

      // 2. Fallback de fetch direto do content script
      if (!data) {
        try {
          const res = await fetch(url, {
            credentials: 'include',
            headers: reqHeaders
          });
          if (res.ok) {
            data = await res.json();
          }
        } catch {}
      }

      if (!data) continue;

      const list = data?.comentarios?.pageComentarios?.list
        || data?.pageComentarios?.list
        || (Array.isArray(data?.comentarios) ? data.comentarios : null)
        || data?.comentarios?.list
        || data?.discussoes
        || (Array.isArray(data) ? data : [])
        || [];

      if (!Array.isArray(list) || list.length === 0) continue;

      // Filtra comentários válidos: ignora silenciados, bloqueados e avisos de votos negativos
      const valid = list.filter(item => {
        if (!item) return false;
        if (item.silenciado || item.bloqueado) return false;
        const raw = (item.comentario || item.texto || item.textoComentario || '').trim();
        if (!raw) return false;
        // Ignora mensagens de comentários com muitos votos negativos ou recolhidos
        if (/votos\s+negativos/i.test(raw)) return false;
        return true;
      });

      if (valid.length === 0) continue;

      // Ordena por quantidade de votos decrescente
      valid.sort((a, b) => {
        const vA = typeof a.quantidadeVoto === 'number' ? a.quantidadeVoto : (parseInt(a.quantidadeVoto ?? a.votos ?? 0, 10) || 0);
        const vB = typeof b.quantidadeVoto === 'number' ? b.quantidadeVoto : (parseInt(b.quantidadeVoto ?? b.votos ?? 0, 10) || 0);
        return vB - vA;
      });

      const top = valid[0];
      const topVotes = typeof top.quantidadeVoto === 'number' ? top.quantidadeVoto : (parseInt(top.quantidadeVoto ?? top.votos ?? 0, 10) || 0);

      // Se o comentário mais votado for negativo (saldo de downvotes), descarta
      if (topVotes < 0) {
        continue;
      }

      const raw = top.comentario || top.texto || top.textoComentario || '';
      if (raw && raw.trim().length > 3) {
        return raw;
      }
    }

    return '';
  }

  // Extração do comentário do fórum com mais votos no DOM (suporta texto e imagens puras)
  function getTopForumCommentFromDOM(questionElem) {
    try {
      const root = (questionElem && questionElem.querySelector && (questionElem.querySelector('.questao-complementos, [class*="discussao"]') || questionElem)) || document;

      // 1. Localiza os cards principais de comentários
      let cards = Array.from(root.querySelectorAll(
        '.questao-complementos-comentario-linha, ' +
        '[ng-repeat*="comentario in"], ' +
        '[ng-repeat*="comentario"], ' +
        '[class*="discussao-comentario-linha"], ' +
        '[class*="comentario-linha"], ' +
        '.forum-comentario, .comentario-item, .item-comentario'
      ));

      // Se não encontrou pelos seletores de linha, procura a partir dos blocos de texto
      if (!cards.length) {
        const bodies = Array.from(root.querySelectorAll(
          '.comentario-texto, [class*="comentario-conteudo"], [class*="comentario-texto"], [ng-bind-html*="comentario"], .jodit-wysiwyg'
        ));
        cards = bodies.map(b => b.closest('.questao-complementos > div, [class*="discussao"] > div, [class*="comentario"]') || b.parentElement);
      }

      // Remove nulos, duplicados e elementos aninhados (mantém apenas os containers principais de cada comentário)
      cards = [...new Set(cards)].filter(Boolean);
      cards = cards.filter(card => !cards.some(other => other !== card && other.contains(card)));

      let bestHtml = '';
      let maxVotes = -1; // Só aceita comentários com saldo de votos >= 0

      for (const card of cards) {
        const cardText = card.textContent || '';

        // 2. DESCARTA IMEDIATAMENTE avisos de comentários com muitos votos negativos ou bloqueados
        // Exemplo: "Este post de Lucas.fiscal - ( FOCO: SEFAZ AL 2027) recebeu muitos votos negativos. Exibir"
        if (
          /votos\s+negativos/i.test(cardText) ||
          /recebeu\s+muitos\s+votos/i.test(cardText) ||
          card.querySelector('.comentario-negativo, .comentario-oculto, [class*="votos-negativos"]')
        ) {
          // Se ainda estiver recolhido (tem link/botão "Exibir" e não tem corpo visível), descarta totalmente
          const hasVisibleBody = card.querySelector('.comentario-texto, [class*="comentario-conteudo"], [ng-bind-html*="comentario"]');
          if (!hasVisibleBody || /Exibir/i.test(cardText)) {
            continue;
          }
        }

        // 3. Localiza o corpo do comentário (ignora cabeçalhos com apelido, avatares, botões)
        const bodyEl = card.querySelector(
          '.comentario-texto, [class*="comentario-conteudo"], [class*="comentario-texto"], [class*="texto"], [ng-bind-html*="comentario"], .jodit-wysiwyg'
        );

        // Detecta imagens de conteúdo (ignora avatares e ícones)
        const contentImgs = Array.from((bodyEl || card).querySelectorAll('img')).filter(img => {
          const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
          const alt = img.getAttribute('alt') || '';
          const cls = img.className || '';
          return !/avatar|perfil|user|icon|svg|logo/i.test(src + ' ' + alt + ' ' + cls);
        });

        let html = bodyEl ? bodyEl.innerHTML : '';
        if (!html && contentImgs.length > 0) {
          html = contentImgs.map(img => img.outerHTML).join('<br>');
        }

        // Se não encontrou bodyEl nem imagem de conteúdo, NÃO usa card.innerHTML (para evitar pegar nickname e aviso de votos)
        if (!html) {
          continue;
        }

        const textOnly = html.replace(/<[^>]+>/g, '').trim();
        const hasImage = contentImgs.length > 0 || html.includes('<img');
        const hasValidContent = hasImage || textOnly.length >= 5;

        // Se o conteúdo for apenas mensagem de votos negativos ou vazio, descarta
        if (!hasValidContent || /votos\s+negativos/i.test(textOnly)) {
          continue;
        }

        // 4. Extração confiável de votos do card
        let votes = 0;
        let hasExplicitVotes = false;

        // Procura primeiro elemento específico de contador de votos
        const voteEl = card.querySelector(
          '[ng-bind*="quantidadeVoto"], [ng-bind*="voto"], [class*="quantidade-voto"], ' +
          '[class*="voto-quantidade"], [class*="votos-numero"], [class*="voto-total"], ' +
          '[class*="score"], [class*="pontos"], [class*="quantidade"]'
        );

        if (voteEl && (!bodyEl || (!bodyEl.contains(voteEl) && voteEl !== bodyEl))) {
          const voteTxt = voteEl.textContent.trim();
          const m = voteTxt.match(/^[^\d-]*(-?\d+)/) || voteTxt.match(/(-?\d+)/);
          if (m) {
            votes = parseInt(m[1] || m[0], 10);
            hasExplicitVotes = true;
          }
        }

        // Se não encontrou no voteEl, procura no card por padrão estrito de voto (NUNCA com prefixo opcional)
        if (!hasExplicitVotes) {
          const explicitMatch =
            cardText.match(/(?:[▲▼+]|\bup\b|\bdown\b|votos?\s*:?)\s*(-?\d{1,4})\b/i) ||
            cardText.match(/(-?\d{1,4})\s*(?:votos?\b|pontos?\b|[▲▼])/i);
          if (explicitMatch) {
            votes = parseInt(explicitMatch[1], 10);
            hasExplicitVotes = true;
          }
        }

        // Comentários com saldo negativo de votos (downvoted) são rejeitados
        if (votes < 0) {
          continue;
        }

        // 5. Atualiza o melhor comentário
        if (votes > maxVotes || (!bestHtml && votes >= 0)) {
          maxVotes = votes;
          bestHtml = html;
        }
      }

      return bestHtml;
    } catch {
      return '';
    }
  }

  function normalizeAssets(html) {
    if (!html) return '';
    // Converte lazy-load data-src ou src relativo em URL absoluta
    let withAbs = html.replace(/<img\b([^>]*?)>/gi, (match, attrs) => {
      try {
        const srcMatch = attrs.match(/\bsrc=["']?([^"'\s>]+)["']?/i);
        const dataSrcMatch = attrs.match(/\bdata-(?:src|original|zoom)=["']?([^"'\s>]+)["']?/i);
        let src = (srcMatch && srcMatch[1]) || (dataSrcMatch && dataSrcMatch[1]);
        if (!src) return match;
        const abs = new URL(src, window.location.origin).href;
        let updatedAttrs = attrs;
        if (srcMatch) {
          updatedAttrs = updatedAttrs.replace(srcMatch[0], `src="${abs}"`);
        } else {
          updatedAttrs += ` src="${abs}"`;
        }
        return `<img${updatedAttrs}>`;
      } catch {
        return match;
      }
    });
    return cleanHtml(withAbs);
  }

  // --------------------------------------------------------------------------
  // Helpers do Modal IA
  // --------------------------------------------------------------------------
  function cleanMateriaText(text) {
    if (!text) return 'Geral';
    return text
      .replace(/^[\s\u00A0]*Mat[eé]ria:?[\s\u00A0]*/i, '')
      .replace(/\s+/g, ' ')
      .trim() || 'Geral';
  }

  function formatBadgeLabel(q, suffix = '') {
    const mat = cleanMateriaText(q.materia);
    let label = q.id ? `Q.${q.id}` : '';
    if (mat && mat !== 'Geral') {
      label = label ? `${label} · ${mat}` : mat;
    }
    if (suffix) {
      label = `${label} ${suffix}`;
    }
    return label;
  }

  function centerAiModal() {
    const modal = document.getElementById('tec-tools-ai-modal');
    if (!modal) return;
    const modalWidth = Math.min(960, Math.max(360, window.innerWidth - 32));
    const modalHeight = Math.min(660, Math.max(300, window.innerHeight - 48));
    const left = Math.max(16, Math.round((window.innerWidth - modalWidth) / 2));
    const top = Math.max(20, Math.round((window.innerHeight - modalHeight) / 2));

    modal.style.left = `${left}px`;
    modal.style.top = `${top}px`;
    modal.style.width = `${modalWidth}px`;
    modal.style.height = `${modalHeight}px`;
    modal.style.right = 'auto';
    modal.style.bottom = 'auto';
    modal.style.transform = 'none';
  }

  // --------------------------------------------------------------------------
  // 2. Explicar com IA
  // --------------------------------------------------------------------------
  async function handleExplainWithAI(q) {
    const modal = document.getElementById('tec-tools-ai-modal');
    const badge = document.getElementById('tt-ai-badge');
    const content = document.getElementById('tt-ai-content');

    // Centraliza o modal perfeitamente na tela com coordenadas seguras em pixels
    centerAiModal();

    badge.textContent = 'Carregando...';
    content.dataset.rawMarkdown = '';
    content.innerHTML = `
      <div class="tt-loading-container">
        <div class="tt-apple-spinner"></div>
        <span class="tt-loading-text">Identificando dados da questão e preparando explicação didática...</span>
      </div>
    `;

    modal.classList.add('tt-visible');

    // Garante que a questão possui o ID real e todos os metadados (especialmente em cadernos)
    await ensureRealQuestionData(q);

    const badgeText = formatBadgeLabel(q);
    badge.textContent = badgeText;
    badge.title = q.assunto ? `${badgeText} (Assunto: ${q.assunto})` : badgeText;

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
          const streamBadge = formatBadgeLabel(q, '(Transmitindo...)');
          badge.textContent = streamBadge;
          badge.title = q.assunto ? `${formatBadgeLabel(q)} (Assunto: ${q.assunto})` : formatBadgeLabel(q);
        }
        fullText += msg.chunk;
        content.dataset.rawMarkdown = fullText;
        content.innerHTML = renderMarkdown(fullText);
        content.scrollTop = content.scrollHeight;
      } else if (msg.type === 'DONE') {
        const finalBadge = formatBadgeLabel(q);
        badge.textContent = finalBadge;
        badge.title = q.assunto ? `${finalBadge} (Assunto: ${q.assunto})` : finalBadge;
        content.dataset.rawMarkdown = fullText;
        try { port.disconnect(); } catch {}
      } else if (msg.type === 'ERROR') {
        badge.textContent = 'Erro';
        badge.title = msg.error || 'Erro';
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
  // Direct Manipulation: Arraste de Janela Suave e Seguro (Apple HIG)
  // --------------------------------------------------------------------------
  function setupDraggableModal(modal) {
    const titlebar = modal.querySelector('.tt-modal-titlebar');
    let isDragging = false;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;

    titlebar.addEventListener('pointerdown', (e) => {
      // Ignora clique em botões da barra de títulos (Copiar, Regerar, Fechar)
      if (e.target.closest('button')) return;

      isDragging = true;
      try {
        titlebar.setPointerCapture(e.pointerId);
      } catch {}

      const rect = modal.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      initialLeft = rect.left;
      initialTop = rect.top;

      modal.style.right = 'auto';
      modal.style.bottom = 'auto';
      modal.style.transform = 'none';
      modal.style.left = `${initialLeft}px`;
      modal.style.top = `${initialTop}px`;
      modal.style.transition = 'none';
    });

    titlebar.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      const rect = modal.getBoundingClientRect();
      const modalWidth = rect.width;

      // Limites seguros do viewport:
      // O topo NUNCA pode ser menor que 10px (garante que a barra de títulos e botões fiquem sempre acessíveis!)
      const minTop = 10;
      const maxTop = Math.max(10, window.innerHeight - 50);
      const minLeft = Math.min(10, 120 - modalWidth);
      const maxLeft = Math.max(10, window.innerWidth - 120);

      const nextLeft = Math.max(minLeft, Math.min(initialLeft + dx, maxLeft));
      const nextTop = Math.max(minTop, Math.min(initialTop + dy, maxTop));

      modal.style.left = `${nextLeft}px`;
      modal.style.top = `${nextTop}px`;
    });

    const stopDrag = (e) => {
      if (!isDragging) return;
      isDragging = false;
      modal.style.transition = '';
      try {
        if (titlebar.hasPointerCapture(e.pointerId)) {
          titlebar.releasePointerCapture(e.pointerId);
        }
      } catch {}
    };

    titlebar.addEventListener('pointerup', stopDrag);
    titlebar.addEventListener('pointercancel', stopDrag);

    // Duplo clique na barra de títulos recenteia o modal
    titlebar.addEventListener('dblclick', (e) => {
      if (e.target.closest('button')) return;
      centerAiModal();
    });
  }

  function prepareHtmlForClipboard(html) {
    if (!html) return '';
    const temp = document.createElement('div');
    temp.innerHTML = html;

    temp.querySelectorAll('.tt-loading-container, .tt-apple-spinner').forEach(el => el.remove());

    temp.querySelectorAll('h1').forEach(el => {
      el.style.cssText = 'font-size: 20px; font-weight: 700; margin: 16px 0 8px 0; color: #111;';
    });
    temp.querySelectorAll('h2').forEach(el => {
      el.style.cssText = 'font-size: 16px; font-weight: 600; margin: 14px 0 6px 0; border-bottom: 1px solid #e0e0e0; padding-bottom: 4px; color: #111;';
    });
    temp.querySelectorAll('h3').forEach(el => {
      el.style.cssText = 'font-size: 14px; font-weight: 600; margin: 12px 0 4px 0; color: #0066cc;';
    });
    temp.querySelectorAll('p').forEach(el => {
      el.style.cssText = 'margin: 0 0 10px 0; line-height: 1.6; color: #222;';
    });
    temp.querySelectorAll('strong').forEach(el => {
      el.style.cssText = 'font-weight: 600; color: #000;';
    });
    temp.querySelectorAll('em').forEach(el => {
      el.style.cssText = 'font-style: italic;';
    });
    temp.querySelectorAll('blockquote').forEach(el => {
      el.style.cssText = 'border-left: 4px solid #0071e3; margin: 12px 0; padding: 8px 14px; background: #f0f7ff; color: #222; border-radius: 0 6px 6px 0;';
    });
    temp.querySelectorAll('code').forEach(el => {
      el.style.cssText = 'background: #f1f3f5; padding: 2px 5px; border-radius: 4px; font-family: monospace; font-size: 0.9em; color: #d63384;';
    });
    temp.querySelectorAll('pre').forEach(el => {
      el.style.cssText = 'background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px; padding: 10px 14px; overflow-x: auto; font-family: monospace; margin: 10px 0;';
    });
    temp.querySelectorAll('ul').forEach(el => {
      el.style.cssText = 'margin: 0 0 12px 24px; padding: 0;';
    });
    temp.querySelectorAll('ol').forEach(el => {
      el.style.cssText = 'margin: 0 0 12px 24px; padding: 0;';
    });
    temp.querySelectorAll('li').forEach(el => {
      el.style.cssText = 'margin-bottom: 5px; line-height: 1.5; color: #222;';
    });

    return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #222;">${temp.innerHTML}</div>`;
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
