/**
 * TEC-Tools — Options Page Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Tabs Navigation
  const navItems = document.querySelectorAll('.nav-item');
  const tabPanes = document.querySelectorAll('.tab-pane');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tabId = item.getAttribute('data-tab');
      navItems.forEach(n => n.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      item.classList.add('active');
      const targetPane = document.getElementById(`tab-${tabId}`);
      if (targetPane) targetPane.classList.add('active');
    });
  });

  // Slider Temperature
  const tempSlider = document.getElementById('aiTemperature');
  const tempVal = document.getElementById('aiTempVal');
  tempSlider.addEventListener('input', () => {
    tempVal.textContent = tempSlider.value;
  });

  // Load Config
  const res = await chrome.runtime.sendMessage({ action: 'GET_CONFIG' });
  if (res && res.success && res.config) {
    const c = res.config;
    document.getElementById('ankiUrl').value = c.ankiUrl || 'http://127.0.0.1:8765';
    document.getElementById('ankiDeck').value = c.ankiDeck || 'TEC Concursos';
    document.getElementById('ankiModel').value = c.ankiModel || 'Básico';
    document.getElementById('ankiTemplateFront').value = c.ankiTemplateFront || '';
    document.getElementById('ankiTemplateBack').value = c.ankiTemplateBack || '';

    document.getElementById('aiUrl').value = c.aiUrl || 'https://api.openai.com/v1/chat/completions';
    document.getElementById('aiKey').value = c.aiKey || '';
    document.getElementById('aiModel').value = c.aiModel || 'gpt-4o-mini';
    tempSlider.value = c.aiTemperature !== undefined ? c.aiTemperature : 0.7;
    tempVal.textContent = tempSlider.value;
    document.getElementById('aiPrompt').value = c.aiPrompt || '';

    document.getElementById('showDockPill').checked = Boolean(c.showDockPill);
  }

  // Tenta carregar baralhos e modelos automaticamente se o Anki estiver aberto
  async function carregarListasAnki(url) {
    try {
      const decksRes = await chrome.runtime.sendMessage({ action: 'TEST_ANKI', url });
      if (decksRes && decksRes.success) {
        if (Array.isArray(decksRes.decks)) {
          const deckDl = document.getElementById('ankiDeckList');
          deckDl.innerHTML = decksRes.decks.map(d => `<option value="${d}">`).join('');
        }
      }
      const modelsRes = await chrome.runtime.sendMessage({ action: 'ANKI_GET_MODELS' });
      if (modelsRes && modelsRes.success && Array.isArray(modelsRes.models)) {
        const modelDl = document.getElementById('ankiModelList');
        modelDl.innerHTML = modelsRes.models.map(m => `<option value="${m}">`).join('');
      }
    } catch {}
  }
  carregarListasAnki(document.getElementById('ankiUrl').value.trim());

  // Save Config
  async function saveSettings() {
    const config = {
      ankiUrl: document.getElementById('ankiUrl').value.trim(),
      ankiDeck: document.getElementById('ankiDeck').value.trim() || 'TEC Concursos',
      ankiModel: document.getElementById('ankiModel').value.trim() || 'Básico',
      ankiTemplateFront: document.getElementById('ankiTemplateFront').value,
      ankiTemplateBack: document.getElementById('ankiTemplateBack').value,

      aiUrl: document.getElementById('aiUrl').value.trim() || 'https://api.openai.com/v1/chat/completions',
      aiKey: document.getElementById('aiKey').value.trim(),
      aiModel: document.getElementById('aiModel').value.trim() || 'gpt-4o-mini',
      aiTemperature: parseFloat(tempSlider.value) || 0.7,
      aiPrompt: document.getElementById('aiPrompt').value,

      showDockPill: document.getElementById('showDockPill').checked
    };

    await chrome.storage.sync.set(config);
    const saveStatus = document.getElementById('saveStatus');
    saveStatus.textContent = '✓ Configurações salvas com sucesso!';
    saveStatus.style.color = '#34c759';
    setTimeout(() => {
      saveStatus.textContent = 'Todas as alterações são salvas automaticamente';
      saveStatus.style.color = '';
    }, 2500);
  }

  document.getElementById('btnSave').addEventListener('click', saveSettings);

  // Auto-save on change
  document.querySelectorAll('input, textarea').forEach(el => {
    el.addEventListener('change', saveSettings);
  });

  // Test AnkiConnect
  const btnTestAnki = document.getElementById('btnTestAnki');
  const ankiStatusMsg = document.getElementById('ankiStatusMsg');

  btnTestAnki.addEventListener('click', async () => {
    const url = document.getElementById('ankiUrl').value.trim();
    btnTestAnki.disabled = true;
    btnTestAnki.textContent = 'Testando...';
    ankiStatusMsg.classList.add('hidden');

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'TEST_ANKI',
        url
      });

      ankiStatusMsg.classList.remove('hidden');
      if (response && response.success) {
        ankiStatusMsg.className = 'status-badge success';
        ankiStatusMsg.textContent = `✓ Conectado ao Anki! Versão da API: ${response.version}. Baralhos encontrados: ${response.decks.length}.`;
        carregarListasAnki(url);
      } else {
        ankiStatusMsg.className = 'status-badge error';
        ankiStatusMsg.textContent = `✕ ${response.error || 'Falha na resposta'}`;
      }
    } catch (err) {
      ankiStatusMsg.classList.remove('hidden');
      ankiStatusMsg.className = 'status-badge error';
      ankiStatusMsg.textContent = `✕ Erro: ${err.message}`;
    } finally {
      btnTestAnki.disabled = false;
      btnTestAnki.textContent = 'Testar Conexão';
    }
  });
});
