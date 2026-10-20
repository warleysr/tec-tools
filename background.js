/**
 * TEC-Tools — Background Service Worker
 * Gerencia chamadas ao AnkiConnect e provedores de IA sem bloqueio de CORS.
 */

const DEFAULT_CONFIG = {
  wheelPosition: "center",
  wheelTrigger: "button-and-hotkey",
  showDockPill: false,
  hotkey: "KeyW",
  ankiUrl: "http://127.0.0.1:8765",
  ankiDeck: "TEC Concursos",
  ankiModel: "Basic",
  ankiFrontField: "Front",
  ankiBackField: "Back",
  ankiTemplateFront: `<h3>{{materia}}</h3>\n<h4>{{assunto}}</h4>\n<p><strong>Questão:</strong> {{id}} ({{banca}} / {{ano}} - {{orgao}})</p>\n<div class="enunciado">{{enunciado}}</div>\n<hr>\n<div class="alternativas">{{alternativas}}</div>`,
  ankiTemplateBack: `<h3>Gabarito: {{gabarito}}</h3>\n<div class="gabarito-texto">{{gabarito_texto}}</div>\n<hr>\n<p><small><a href="{{url}}">Ver no TEC Concursos</a></small></p>`,
  aiUrl: "https://api.openai.com/v1/chat/completions",
  aiKey: "",
  aiModel: "gpt-4o-mini",
  aiTemperature: 0.7,
  aiPrompt: `Você é um professor especialista em preparação para concursos públicos. Analise a seguinte questão com rigor e didática:

Estrutura da resposta:
1. **Gabarito e Conceito Central**: Alternativa correta e a fundamentação principal.
2. **Análise Passo a Passo**: Por que a alternativa correta está certa (lei, súmula, jurisprudência ou doutrina).
3. **Ponto Crítico das Demais Opções**: Destaque o erro exato de cada distrator.
4. **Mnemônico ou Dica de Prova**: Uma síntese rápida para não errar mais.

Dados:
- Matéria: {{materia}} | Assunto: {{assunto}}
- Banca: {{banca}} | Ano: {{ano}} | Órgão: {{orgao}}
- Gabarito: {{gabarito}}

Enunciado:
{{enunciado}}

Alternativas:
{{alternativas_completas}}`
};

// Carrega configurações com fallback para defaults
async function getConfig() {
  const stored = await chrome.storage.sync.get(DEFAULT_CONFIG);
  return { ...DEFAULT_CONFIG, ...stored };
}

// Helper para chamadas ao AnkiConnect
async function callAnkiConnect(url, action, params = {}) {
  const endpoint = url || "http://127.0.0.1:8765";
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, version: 6, params })
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    const data = await res.json();
    if (data.error) {
      throw new Error(data.error);
    }
    return data.result;
  } catch (err) {
    if (err.message.includes("Failed to fetch") || err.message.includes("NetworkError")) {
      throw new Error("Não foi possível conectar ao AnkiConnect. Certifique-se de que o Anki está aberto com o plugin AnkiConnect ativo na porta 8765.");
    }
    throw err;
  }
}

// Helper para chamadas de IA
async function callAICompletions(config, systemPrompt, userPrompt) {
  if (!config.aiKey && !config.aiUrl.includes("localhost") && !config.aiUrl.includes("127.0.0.1")) {
    throw new Error("Chave de API de IA não configurada. Abra as opções da extensão TEC-Tools para inserir sua chave.");
  }

  const endpoint = config.aiUrl.trim() || "https://api.openai.com/v1/chat/completions";
  const headers = { "Content-Type": "application/json" };
  if (config.aiKey) {
    headers["Authorization"] = `Bearer ${config.aiKey.trim()}`;
  }

  const payload = {
    model: config.aiModel.trim() || "gpt-4o-mini",
    temperature: parseFloat(config.aiTemperature) || 0.7,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    let parsedMsg = errText;
    try {
      const j = JSON.parse(errText);
      parsedMsg = j.error?.message || errText;
    } catch {}
    throw new Error(`Erro na API de IA (${response.status}): ${parsedMsg}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("A API retornou uma resposta vazia.");
  }
  return content;
}

// Listener de mensagens do content script e opções
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      const config = await getConfig();

      switch (request.action) {
        case "GET_CONFIG":
          sendResponse({ success: true, config });
          break;

        case "TEST_ANKI": {
          const targetUrl = request.url || config.ankiUrl;
          const version = await callAnkiConnect(targetUrl, "version");
          const decks = await callAnkiConnect(targetUrl, "deckNames");
          sendResponse({ success: true, version, decks });
          break;
        }

        case "ANKI_GET_DECKS": {
          const decks = await callAnkiConnect(config.ankiUrl, "deckNames");
          sendResponse({ success: true, decks });
          break;
        }

        case "ANKI_GET_MODELS": {
          const models = await callAnkiConnect(config.ankiUrl, "modelNames");
          sendResponse({ success: true, models });
          break;
        }

        case "ANKI_ADD_NOTE": {
          const noteData = request.note;
          const deck = config.ankiDeck.trim() || "TEC Concursos";
          const model = config.ankiModel.trim() || "Basic";

          // Cria baralho caso ainda não exista
          try {
            await callAnkiConnect(config.ankiUrl, "createDeck", { deck });
          } catch {}

          const fields = {};
          const frontField = config.ankiFrontField || "Front";
          const backField = config.ankiBackField || "Back";
          fields[frontField] = noteData.front;
          fields[backField] = noteData.back;

          const tags = ["tec-concursos"];
          if (noteData.materia) tags.push(noteData.materia.replace(/\s+/g, "-"));
          if (noteData.banca) tags.push(noteData.banca.replace(/\s+/g, "-"));

          const noteId = await callAnkiConnect(config.ankiUrl, "addNote", {
            note: {
              deckName: deck,
              modelName: model,
              fields,
              tags,
              options: { allowDuplicate: false }
            }
          });

          sendResponse({ success: true, noteId, deck });
          break;
        }

        case "AI_EXPLAIN": {
          const { question } = request;
          const systemMsg = "Você é um professor e tutor de concursos didático, claro e conciso.";

          let userPrompt = config.aiPrompt;
          const replacements = {
            "{{id}}": question.id || "",
            "{{materia}}": question.materia || "",
            "{{assunto}}": question.assunto || "",
            "{{banca}}": question.banca || "",
            "{{ano}}": question.ano || "",
            "{{orgao}}": question.orgao || "",
            "{{enunciado}}": question.enunciado || "",
            "{{gabarito}}": question.gabarito || "Não informado",
            "{{gabarito_texto}}": question.gabaritoTexto || "",
            "{{alternativas}}": question.alternativasText || "",
            "{{alternativas_completas}}": question.alternativasCompletas || "",
            "{{url}}": question.url || ""
          };

          for (const [key, val] of Object.entries(replacements)) {
            userPrompt = userPrompt.split(key).join(val);
          }

          const explanation = await callAICompletions(config, systemMsg, userPrompt);
          sendResponse({ success: true, explanation });
          break;
        }

        default:
          sendResponse({ success: false, error: "Ação desconhecida: " + request.action });
      }
    } catch (err) {
      sendResponse({ success: false, error: err.message || String(err) });
    }
  })();

  return true; // Mantém o canal de resposta aberto assincronamente
});
