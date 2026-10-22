/**
 * TEC-Tools — Popup Controller (Instant Open & Non-Blocking)
 * Compatível com Firefox WebExtensions e Chromium.
 */

const extAPI = typeof browser !== 'undefined' ? browser : chrome;

function init() {
  const ankiDot = document.getElementById('ankiDot');
  const ankiStatusText = document.getElementById('ankiStatusText');
  const btnOpenOptions = document.getElementById('btnOpenOptions');
  const btnGoTec = document.getElementById('btnGoTec');
  const btnOpenWheel = document.getElementById('btnOpenWheel');

  // 1. Registra os cliques IMEDIATAMENTE (0ms de atraso, sem nenhum await)
  if (btnOpenOptions) {
    btnOpenOptions.addEventListener('click', () => {
      extAPI.runtime.openOptionsPage();
    });
  }

  if (btnGoTec) {
    btnGoTec.addEventListener('click', () => {
      extAPI.tabs.create({ url: 'https://www.tecconcursos.com.br/questoes' });
      window.close();
    });
  }

  if (btnOpenWheel) {
    btnOpenWheel.addEventListener('click', async () => {
      try {
        const [tab] = await extAPI.tabs.query({ active: true, currentWindow: true });
        if (tab?.id && tab.url && tab.url.includes('tecconcursos.com.br')) {
          extAPI.tabs.sendMessage(tab.id, { action: 'OPEN_WHEEL' }).catch(() => {});
        } else {
          extAPI.tabs.create({ url: 'https://www.tecconcursos.com.br/questoes' });
        }
      } catch {
        extAPI.tabs.create({ url: 'https://www.tecconcursos.com.br/questoes' });
      }
      window.close();
    });
  }

  // 2. Ajusta textos e atalhos conforme configuração e aba ativa
  const popupShortcut = document.getElementById('popupShortcut');
  extAPI.runtime.sendMessage({ action: 'GET_CONFIG' }).then(res => {
    if (res?.success && res.config?.hotkeyConfig?.display) {
      const display = res.config.hotkeyConfig.display;
      if (popupShortcut) popupShortcut.textContent = display;
    }
  }).catch(() => {});

  extAPI.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
    if (tab && tab.url && tab.url.includes('tecconcursos.com.br')) {
      if (btnOpenWheel) btnOpenWheel.textContent = '✨ Abrir Wheel Menu';
      if (btnGoTec) btnGoTec.style.display = 'block';
    } else {
      if (btnOpenWheel) btnOpenWheel.textContent = 'Ir para o TEC Concursos';
      if (btnGoTec) btnGoTec.style.display = 'none';
    }
  }).catch(() => {});

  // 3. Testa AnkiConnect em background sem bloquear a abertura (timeout 450ms)
  checkAnki(ankiDot, ankiStatusText);
}

// Checagem direta rápida do AnkiConnect
async function checkAnki(dot, text) {
  if (!dot || !text) return;

  try {
    const res = await fetch('http://127.0.0.1:8765', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'version', version: 6 }),
      signal: AbortSignal.timeout(450)
    });

    if (res.ok) {
      const data = await res.json();
      if (data.result) {
        dot.className = 'dot online';
        text.textContent = `Anki conectado (v${data.result})`;
        return;
      }
    }
    dot.className = 'dot offline';
    text.textContent = 'AnkiConnect offline';
  } catch {
    dot.className = 'dot offline';
    text.textContent = 'AnkiConnect offline';
  }
}

// Garante execução imediata
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
