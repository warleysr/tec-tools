# ⚡ TEC-Tools

Extensão para Mozilla Firefox e Google Chrome projetada especificamente para o [TEC Concursos](https://www.tecconcursos.com.br), adicionando um menu radial circular em donut (**Wheel**, inspirado no [filee.sh](https://filee.sh/)) com estética e física fluidas baseadas no **Apple Design System (macOS / iOS)**.

---

## ✨ Funcionalidades Principais

### 1. 🎡 Menu Radial Donut (Wheel)
- **Design Físico & Fluido**: Inspirado na interface física do Apple Design System e do filee.sh, com materiais em vidro fosco (*glassmorphism*, `backdrop-filter: blur(28px)`), iluminação interna e resposta instantânea no toque/clique (`scale: 0.96` no `:active`).
- **Ativação Rápida**:
  - Pelo botão flutuante (*Dock Pill*) no canto inferior da página.
  - Pelo atalho customizável do teclado (padrão: <kbd>Alt</kbd> + <kbd>W</kbd>, configurável nas Opções para tecla única ou combinações). Funciona exclusivamente no TEC Concursos.
  - **Ativação por Teclado Numérico (1 a 9)**: quando o menu radial está aberto, pressione <kbd>1</kbd> para enviar ao Anki ou <kbd>2</kbd> para explicar com IA.
  - Pressionar <kbd>Esc</kbd> ou clicar fora fecha a roda suavemente com animação de mola (*spring*).

### 2. 🎴 Enviar para o Anki (via AnkiConnect)
- Extrai instantaneamente a questão atualmente ativa/resolvida:
  - **Frente**: Enunciado completo, cabeçalho (Matéria, Assunto, Banca, Ano, Órgão, ID) e alternativas.
  - **Verso**: Gabarito oficial identificado na resolução e texto correspondente.
- **Templates 100% Customizáveis**: Configure os campos e o HTML da frente e do verso através das opções da extensão utilizando variáveis:
  - `{{enunciado}}`, `{{alternativas}}`, `{{gabarito}}`, `{{gabarito_texto}}`, `{{materia}}`, `{{assunto}}`, `{{banca}}`, `{{ano}}`, `{{orgao}}`, `{{id}}`, `{{url}}`.
- Notificação dinâmica em estilo *Dynamic Island* da Apple informando a confirmação do card salvo no baralho configurado.

### 3. ✨ Explicar com IA (Janela Translúcida macOS)
- Envia a questão, alternativas e gabarito para modelos de linguagem.
- **Janela Translúcida Flutuante**:
  - Estética visual macOS / Sequoia / visionOS com controles *traffic lights* (fechar, minimizar).
  - *Direct manipulation*: janela arrastável pelo cabeçalho respeitando a física do ponteiro (*grab offset*) e redimensionável.
  - Renderizador nativo de Markdown (negrito, listas, citações, títulos, blocos de código).
  - Botão de cópia rápida com feedback tátil e botão de regerar análise.
- **Totalmente Configurável**:
  - Endpoint compatível com a API OpenAI v1 (OpenAI, OpenRouter, Groq, DeepSeek, Ollama local, etc.).
  - Modelo configurável (`gpt-4o-mini`, `gpt-4o`, `claude-3-5-sonnet`, `llama-3.3-70b`, etc.).
  - Prompt didático e temperatura ajustáveis.

---

## 🦊 Como Instalar no Mozilla Firefox

1. Abra o **Mozilla Firefox** e digite na barra de endereços:
   ```
   about:debugging#/runtime/this-firefox
   ```
2. Clique no botão **Carregar extensão temporária...** (*Load Temporary Add-on...*).
3. Navegue até a pasta da extensão (`tec-tools`) e selecione o arquivo **`manifest.json`**.
4. Pronto! A extensão estará carregada e ativa com ID permanente (`tec-tools@extension`) em todas as páginas do `tecconcursos.com.br`.

---

## 🚀 Como Instalar no Google Chrome / Brave / Edge

1. Abra o navegador e acesse:
   ```
   chrome://extensions/
   ```
2. Ative a opção **Modo do desenvolvedor** no canto superior direito.
3. Clique em **Carregar sem compactação** (*Load unpacked*).
4. Selecione a pasta da extensão (`tec-tools`).
5. Pronto! A extensão estará ativa em todas as páginas do `tecconcursos.com.br`.

---

## ⚙️ Configurações

Clique com o botão direito no ícone da extensão e selecione **Opções** (ou pelo menu popup):

- **AnkiConnect**:
  - Certifique-se de que o Anki está aberto com o plugin [AnkiConnect](https://ankiweb.net/shared/info/2055492153) instalado (código `2055492153`).
  - URL padrão: `http://127.0.0.1:8765`.
  - Clique em **Testar Conexão** para validar a comunicação em tempo real.
- **Inteligência Artificial**:
  - Defina sua chave de API (OpenAI, OpenRouter, Groq, Google Gemini, etc.) e o modelo desejado.
  - **Suporte ao Google Gemini / Custom Headers**:
    - **Endpoint**: `https://generativelanguage.googleapis.com/v1beta/interactions`
    - **Modelo**: `gemini-3.8-flash`
    - **Headers Customizados**:
      ```http
      x-goog-api-key: {{key}}
      Api-Revision: 2026-05-20
      ```
    - O token `{{key}}` é substituído automaticamente pela sua chave de API informada.

---

## 🛠️ Tecnologias

- **Manifest V3**: Padrão moderno de extensões do Chrome.
- **Vanilla JavaScript & CSS Moderno**: Alta velocidade, sem dependências externas pesadas ou empacotadores lentos.
- **Apple Human Interface Guidelines (HIG)**: Transparências com blur gaussiano, transições com curvas cúbicas/mola e tipografia San Francisco.
- **AnkiConnect API v6**: Integração direta com o motor local do Anki.

---

## 📄 Licença

MIT License © [warleysr](https://github.com/warleysr)
