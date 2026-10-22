/**
 * TEC-Tools — Background Script / Service Worker
 * Gerencia chamadas ao AnkiConnect e provedores de IA sem bloqueio de CORS.
 * Compatível com Firefox (WebExtensions / Event Page) e Chromium (MV3 Service Worker).
 */

const extAPI = typeof browser !== "undefined" ? browser : chrome;

const DEFAULT_CONFIG = {
  wheelPosition: "center",
  wheelTrigger: "button-and-hotkey",
  showDockPill: true,
  hotkey: "KeyW",
  hotkeyConfig: {
    altKey: true,
    ctrlKey: false,
    shiftKey: false,
    metaKey: false,
    code: "KeyW",
    key: "w",
    display: "Alt + W"
  },
  ankiUrl: "http://127.0.0.1:8765",
  ankiDeck: "TEC Concursos",
  ankiModel: "Básico",
  ankiFrontField: "Frente",
  ankiBackField: "Verso",
  ankiTemplateFront: `<h3>{{materia}}</h3>\n<h4>{{assunto}}</h4>\n<p><strong>Questão:</strong> {{id}} ({{banca}} / {{ano}} - {{orgao}})</p>\n<div class="enunciado">{{enunciado}}</div>\n<hr>\n<div class="alternativas">{{alternativas}}</div>`,
  ankiTemplateBack: `<h3>Gabarito: {{gabarito}}</h3>\n<div class="gabarito-texto">{{gabarito_texto}}</div>\n<hr>\n<p><small><a href="{{url}}">Ver no TEC Concursos</a></small></p>`,
  aiUrl: "https://generativelanguage.googleapis.com/v1beta/interactions",
  aiKey: "",
  aiHeaders: "Api-Revision: 2026-05-20",
  aiModel: "gemini-3.5-flash-lite",
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
  const stored = await extAPI.storage.sync.get(DEFAULT_CONFIG);
  return { ...DEFAULT_CONFIG, ...stored };
}

// Helper para chamadas ao AnkiConnect
async function callAnkiConnect(url, action, params = {}) {
  const endpoint = url || "http://127.0.0.1:8765";
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, version: 6, params }),
      signal: AbortSignal.timeout(800)
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
    if (err.name === "TimeoutError" || err.message.includes("Failed to fetch") || err.message.includes("NetworkError")) {
      throw new Error("Não foi possível conectar ao AnkiConnect. Certifique-se de que o Anki está aberto com o plugin AnkiConnect ativo na porta 8765.");
    }
    throw err;
  }
}

// Helper para preparar requisições de IA (compatível com Gemini Interactions e OpenAI)
function prepareAIRequest(config, systemPrompt, userPrompt, isStreaming = false) {
  const endpoint = config.aiUrl?.trim() || "https://generativelanguage.googleapis.com/v1beta/interactions";
  const headers = { "Content-Type": "application/json" };
  const key = (config.aiKey || "").trim();

  // Parse de headers customizados
  if (config.aiHeaders && config.aiHeaders.trim()) {
    try {
      const parsed = JSON.parse(config.aiHeaders);
      for (const [k, v] of Object.entries(parsed)) {
        headers[k] = String(v)
          .replace("{{key}}", key)
          .replace("$GEMINI_API_KEY", key);
      }
    } catch {
      config.aiHeaders.split("\n").forEach(line => {
        const idx = line.indexOf(":");
        if (idx > 0) {
          const k = line.slice(0, idx).trim();
          const v = line.slice(idx + 1).trim()
            .replace("{{key}}", key)
            .replace("$GEMINI_API_KEY", key);
          if (k) headers[k] = v;
        }
      });
    }
  }

  const isGemini = endpoint.includes("generativelanguage.googleapis.com") || endpoint.includes("/interactions");

  if (isGemini) {
    if (key && !headers["x-goog-api-key"] && !headers["api-key"]) {
      headers["x-goog-api-key"] = key;
    }
    if (!headers["Api-Revision"]) {
      headers["Api-Revision"] = "2026-05-20";
    }
  } else if (key && !headers["Authorization"]) {
    headers["Authorization"] = `Bearer ${key}`;
  }

  let payload;
  if (isGemini) {
    payload = {
      model: config.aiModel?.trim() || "gemini-3.5-flash-lite",
      input: `${systemPrompt}\n\n${userPrompt}`
    };
    if (isStreaming) payload.stream = true;
  } else {
    payload = {
      model: config.aiModel?.trim() || "gpt-4o-mini",
      temperature: parseFloat(config.aiTemperature) || 0.7,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    };
    if (isStreaming) payload.stream = true;
  }

  return { endpoint, headers, payload };
}

// Streaming de IA via Server-Sent Events (SSE)
async function streamAICompletions(config, systemPrompt, userPrompt, onChunk, onDone, onError) {
  try {
    const { endpoint, headers, payload } = prepareAIRequest(config, systemPrompt, userPrompt, true);

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
      throw new Error(`Erro na API (${response.status}): ${parsedMsg}`);
    }

    if (!response.body) {
      throw new Error("A resposta não possui corpo de streaming legível.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":") || trimmed.startsWith("event:")) continue;

        if (trimmed.startsWith("data:")) {
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === "[DONE]") continue;

          try {
            const json = JSON.parse(dataStr);
            // Suporta Gemini Interactions: delta.text, step.delta.text, ou OpenAI choices[0].delta.content
            const text = json.delta?.text
              || json.delta?.content
              || json.step?.delta?.text
              || json.choices?.[0]?.delta?.content
              || (typeof json.output === "string" ? json.output : "")
              || "";
            if (text) {
              onChunk(text);
            }
          } catch {}
        }
      }
    }

    if (buffer.trim().startsWith("data:")) {
      try {
        const json = JSON.parse(buffer.trim().slice(5).trim());
        const text = json.delta?.text || json.delta?.content || json.choices?.[0]?.delta?.content || "";
        if (text) onChunk(text);
      } catch {}
    }

    onDone();
  } catch (err) {
    onError(err);
  }
}

// Fallback não-streaming síncrono
async function callAICompletions(config, systemPrompt, userPrompt) {
  const { endpoint, headers, payload } = prepareAIRequest(config, systemPrompt, userPrompt, false);

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
    throw new Error(`Erro na API (${response.status}): ${parsedMsg}`);
  }

  const data = await response.json();

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
extAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
          let decks = [];
          try {
            decks = await callAnkiConnect(targetUrl, "deckNames");
          } catch {}
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

// Listener de streaming contínuo via portas (MessagePort)
extAPI.runtime.onConnect.addListener((port) => {
  if (port.name === "AI_STREAM_CHANNEL") {
    port.onMessage.addListener(async (msg) => {
      if (msg.action === "START_AI_STREAM") {
        try {
          const config = await getConfig();
          const q = msg.question;
          const systemMsg = "Você é um professor e tutor de concursos didático, claro e conciso.";

          let userPrompt = config.aiPrompt;
          const replacements = {
            "{{id}}": q.id || "",
            "{{materia}}": q.materia || "",
            "{{assunto}}": q.assunto || "",
            "{{banca}}": q.banca || "",
            "{{ano}}": q.ano || "",
            "{{orgao}}": q.orgao || "",
            "{{enunciado}}": q.enunciado || "",
            "{{gabarito}}": q.gabarito || "Não informado",
            "{{gabarito_texto}}": q.gabaritoTexto || "",
            "{{alternativas}}": q.alternativasText || "",
            "{{alternativas_completas}}": q.alternativasCompletas || "",
            "{{url}}": q.url || ""
          };

          for (const [key, val] of Object.entries(replacements)) {
            userPrompt = userPrompt.split(key).join(val);
          }

          await streamAICompletions(
            config,
            systemMsg,
            userPrompt,
            (chunk) => {
              try { port.postMessage({ type: "CHUNK", chunk }); } catch {}
            },
            () => {
              try { port.postMessage({ type: "DONE" }); } catch {}
            },
            (err) => {
              try { port.postMessage({ type: "ERROR", error: err.message || String(err) }); } catch {}
            }
          );
        } catch (err) {
          try { port.postMessage({ type: "ERROR", error: err.message || String(err) }); } catch {}
        }
      }
    });
  }
});

// Listener do atalho nativo do navegador (Alt+W)
extAPI.commands.onCommand.addListener(async (command) => {
  if (command === "open-wheel") {
    try {
      const [tab] = await extAPI.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        extAPI.tabs.sendMessage(tab.id, { action: "OPEN_WHEEL" }).catch(() => {});
      }
    } catch {}
  }
});
