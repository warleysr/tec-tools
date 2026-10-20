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
  ankiModel: "Básico",
  ankiFrontField: "Frente",
  ankiBackField: "Verso",
  ankiTemplateFront: `<h3>{{materia}}</h3>\n<h4>{{assunto}}</h4>\n<p><strong>Questão:</strong> {{id}} ({{banca}} / {{ano}} - {{orgao}})</p>\n<div class="enunciado">{{enunciado}}</div>\n<hr>\n<div class="alternativas">{{alternativas}}</div>`,
  ankiTemplateBack: `<h3>Gabarito: {{gabarito}}</h3>\n<div class="gabarito-texto">{{gabarito_texto}}</div>\n<hr>\n<p><small><a href="{{url}}">Ver no TEC Concursos</a></small></p>`,
  aiUrl: "https://api.openai.com/v1/chat/completions",
  aiKey: "",
  aiHeaders: "",
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

// Helper para chamadas de IA (OpenAI, Gemini Interactions, Anthropic, etc.)
async function callAICompletions(config, systemPrompt, userPrompt) {
  const endpoint = config.aiUrl.trim() || "https://api.openai.com/v1/chat/completions";
  const headers = { "Content-Type": "application/json" };

  // Parse de headers customizados (suporta JSON ou formato "Header: Valor" por linha)
  if (config.aiHeaders && config.aiHeaders.trim()) {
    try {
      const parsed = JSON.parse(config.aiHeaders);
      for (const [k, v] of Object.entries(parsed)) {
        headers[k] = String(v)
          .replace("{{key}}", (config.aiKey || "").trim())
          .replace("$GEMINI_API_KEY", (config.aiKey || "").trim());
      }
    } catch {
      config.aiHeaders.split("\n").forEach(line => {
        const idx = line.indexOf(":");
        if (idx > 0) {
          const k = line.slice(0, idx).trim();
          const v = line.slice(idx + 1).trim()
            .replace("{{key}}", (config.aiKey || "").trim())
            .replace("$GEMINI_API_KEY", (config.aiKey || "").trim());
          if (k) headers[k] = v;
        }
      });
    }
  }

  // Se não foi definido header de autenticação customizado e existe aiKey, usa Authorization Bearer
  if (config.aiKey && !headers["Authorization"] && !headers["x-goog-api-key"] && !headers["api-key"]) {
    headers["Authorization"] = `Bearer ${config.aiKey.trim()}`;
  }

  // Detecção de payload: Gemini Interactions vs OpenAI Chat Completions
  const isInteractions = endpoint.includes("/interactions");
  let payload;

  if (isInteractions) {
    payload = {
      model: config.aiModel.trim() || "gemini-3.8-flash",
      input: `${systemPrompt}\n\n${userPrompt}`
    };
  } else {
    payload = {
      model: config.aiModel.trim() || "gpt-4o-mini",
      temperature: parseFloat(config.aiTemperature) || 0.7,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    };
  }

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
      parsedMsg = j.error?.message || j.message || errText;
    } catch {}
    throw new Error(`Erro na API de IA (${response.status}): ${parsedMsg}`);
  }

  const data = await response.json();

  // Extrai o texto da resposta independente da estrutura (OpenAI choices, Gemini output, etc.)
  let content = data.choices?.[0]?.message?.content
    || data.output
    || data.candidates?.[0]?.content?.parts?.[0]?.text
    || data.response
    || data.text;

  if (typeof content === "object" && content !== null) {
    content = content.text || content.content || JSON.stringify(content);
  }

  if (!content) {
    throw new Error("A API retornou uma resposta sem conteúdo textual.");
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
          const deck = config.ankiDeck?.trim() || "TEC Concursos";

          // Garante que o baralho existe
          try {
            await callAnkiConnect(config.ankiUrl, "createDeck", { deck });
          } catch {}

          // 1. Resolve modelo existente no Anki do usuário (ex: "Básico", "Basic")
          const allModels = (await callAnkiConnect(config.ankiUrl, "modelNames").catch(() => [])) || [];
          let targetModel = config.ankiModel?.trim() || "";

          if (!allModels.includes(targetModel)) {
            const match = allModels.find(m => m.toLowerCase() === targetModel.toLowerCase())
              || allModels.find(m => m === "Básico")
              || allModels.find(m => m === "Basic")
              || allModels.find(m => m.startsWith("Basic") || m.startsWith("Básico"))
              || allModels[0]
              || "Básico";
            if (match) targetModel = match;
          }

          // 2. Consulta os nomes reais dos campos do modelo selecionado (ex: Frente/Verso ou Front/Back)
          const modelFields = (await callAnkiConnect(config.ankiUrl, "modelFieldNames", { modelName: targetModel }).catch(() => [])) || [];

          // 3. Monta o payload de campos garantindo que o primeiro campo NUNCA fique vazio
          const frontContent = (noteData.front && noteData.front.trim()) || noteData.enunciado || "Questão TEC Concursos";
          const backContent = (noteData.back && noteData.back.trim()) || noteData.gabarito || "Gabarito TEC Concursos";

          const fields = {};
          if (modelFields.length >= 2) {
            // Mapeia 1º campo para Frente e 2º campo para Verso
            fields[modelFields[0]] = frontContent;
            fields[modelFields[1]] = backContent;
          } else if (modelFields.length === 1) {
            fields[modelFields[0]] = `${frontContent}<hr>${backContent}`;
          } else {
            // Fallbacks genéricos
            fields["Frente"] = frontContent;
            fields["Verso"] = backContent;
            fields["Front"] = frontContent;
            fields["Back"] = backContent;
          }

          // Se o usuário especificou campos customizados que existem no modelo, respeita
          if (config.ankiFrontField && modelFields.includes(config.ankiFrontField)) {
            fields[config.ankiFrontField] = frontContent;
          }
          if (config.ankiBackField && modelFields.includes(config.ankiBackField)) {
            fields[config.ankiBackField] = backContent;
          }

          const tags = ["tec-concursos"];
          if (noteData.materia) tags.push(noteData.materia.replace(/\s+/g, "-"));
          if (noteData.banca) tags.push(noteData.banca.replace(/\s+/g, "-"));

          const noteId = await callAnkiConnect(config.ankiUrl, "addNote", {
            note: {
              deckName: deck,
              modelName: targetModel,
              fields,
              tags,
              options: { allowDuplicate: false }
            }
          });

          sendResponse({ success: true, noteId, deck, model: targetModel });
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
