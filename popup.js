/**
 * TEC-Tools — Popup Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  const ankiDot = document.getElementById('ankiDot');
  const ankiStatusText = document.getElementById('ankiStatusText');
  const btnOpenOptions = document.getElementById('btnOpenOptions');
  const btnGoTec = document.getElementById('btnGoTec');

  btnOpenOptions.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  btnGoTec.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://www.tecconcursos.com.br/questoes' });
  });

  // Verifica status do AnkiConnect
  try {
    const res = await chrome.runtime.sendMessage({ action: 'TEST_ANKI' });
    if (res && res.success) {
      ankiDot.className = 'dot online';
      ankiStatusText.textContent = `Anki conectado (v${res.version})`;
    } else {
      ankiDot.className = 'dot offline';
      ankiStatusText.textContent = 'AnkiConnect offline';
    }
  } catch (err) {
    ankiDot.className = 'dot offline';
    ankiStatusText.textContent = 'AnkiConnect offline';
  }
});
