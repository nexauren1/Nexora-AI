
const state = {
  mode: "chat",
  conversationId: "",
  messages: [],
  attachedFile: null,
  history: [],
  sending: false,
  plan: "free",
  remaining: 100,
  persistent: false,
  live: {
    ws: null,
    audioContext: null,
    playbackContext: null,
    processor: null,
    stream: null,
    nextPlayTime: 0,
    connected: false
  }
};

const els = {
  sidebar: document.getElementById("sidebar"),
  openSidebar: document.getElementById("openSidebar"),
  closeSidebar: document.getElementById("closeSidebar"),
  newChat: document.getElementById("newChatBtn"),
  historyList: document.getElementById("historyList"),
  clearHistory: document.getElementById("clearHistoryBtn"),
  historySearch: document.getElementById("historySearchBtn"),
  messages: document.getElementById("messages"),
  welcome: document.getElementById("welcome"),
  composer: document.getElementById("composer"),
  input: document.getElementById("promptInput"),
  send: document.getElementById("sendBtn"),
  attach: document.getElementById("attachBtn"),
  camera: document.getElementById("cameraBtn"),
  mic: document.getElementById("micBtn"),
  file: document.getElementById("fileInput"),
  cameraInput: document.getElementById("cameraInput"),
  preview: document.getElementById("attachmentPreview"),
  modePill: document.getElementById("modePill"),
  topTitle: document.getElementById("topTitle"),
  plan: document.getElementById("planLabel"),
  credits: document.getElementById("creditsLabel"),
  fill: document.getElementById("usageFill"),
  share: document.getElementById("shareBtn"),
  modal: document.getElementById("modal"),
  modalCard: document.getElementById("modalCard"),
  toast: document.getElementById("toast")
};

const MODE_NAMES = {
  chat: "Chat",
  work: "Trabalhos",
  summary: "Resumos",
  pdf: "PDF",
  documents: "Documentos",
  image: "Analisar imagens",
  "image-gen": "Gerar imagem",
  audio: "Áudio",
  video: "Vídeo",
  code: "Código",
  qa: "Perguntas"
};

const STORAGE_KEY =
  "nexora_history_v2";

const DEVICE_KEY =
  "nexora_device_id";

function makeId() {
  if (
    window.crypto &&
    typeof window.crypto.randomUUID ===
      "function"
  ) {
    return window.crypto.randomUUID();
  }

  return (
    Math.random()
      .toString(36)
      .slice(2) +
    Date.now()
      .toString(36)
  );
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function markdown(value) {
  let safe =
    escapeHtml(value);

  const blocks = [];
  const tick =
    String.fromCharCode(96);

  const fence =
    new RegExp(
      tick +
      "{3}([a-zA-Z0-9_-]*)\\n([\\s\\S]*?)" +
      tick +
      "{3}",
      "g"
    );

  safe = safe.replace(
    fence,
    function(_, lang, code) {
      const token =
        "___CODE_" +
        blocks.length +
        "___";

      blocks.push(
        '<pre><code class="language-' +
        escapeHtml(lang) +
        '">' +
        code +
        "</code></pre>"
      );

      return token;
    }
  );

  const inline =
    new RegExp(
      tick +
      "([^\\n]+?)" +
      tick,
      "g"
    );

  safe = safe.replace(
    inline,
    "<code>$1</code>"
  );

  safe = safe.replace(
    /\*\*([^*]+)\*\*/g,
    "<strong>$1</strong>"
  );

  safe = safe.replace(
    /\*([^*]+)\*/g,
    "<em>$1</em>"
  );

  const lines =
    safe.split("\n");

  let html = "";
  let inList = false;

  for (
    const line of lines
  ) {
    if (
      /^\s*[-•]\s+/.test(line)
    ) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }

      html +=
        "<li>" +
        line.replace(
          /^\s*[-•]\s+/,
          ""
        ) +
        "</li>";
    } else {
      if (inList) {
        html += "</ul>";
        inList = false;
      }

      if (line.trim()) {
        html +=
          "<p>" +
          line +
          "</p>";
      }
    }
  }

  if (inList) {
    html += "</ul>";
  }

  blocks.forEach(
    function(block, index) {
      html =
        html.replace(
          "___CODE_" +
          index +
          "___",
          block
        );
    }
  );

  return html || "<p></p>";
}

function getApiBase() {
  if (
    window.NEXORA_API_BASE
  ) {
    return window.NEXORA_API_BASE
      .replace(/\/+$/, "");
  }

  if (
    location.protocol === "http:" ||
    location.protocol === "https:"
  ) {
    return location.origin;
  }

  return "https://red-dawn-ded1.workers.dev";
}

function ensureDeviceId() {
  let value =
    localStorage.getItem(
      DEVICE_KEY
    );

  if (
    !value ||
    !/^[a-zA-Z0-9_-]{16,100}$/.test(
      value
    )
  ) {
    value =
      makeId().replaceAll(
        "-",
        ""
      ) +
      makeId().replaceAll(
        "-",
        ""
      );

    value =
      value.slice(
        0,
        64
      );

    localStorage.setItem(
      DEVICE_KEY,
      value
    );
  }

  return value;
}

function apiFetch(
  path,
  options
) {
  const opts =
    options || {};

  const target =
    getApiBase() +
    path;

  opts.headers =
    Object.assign(
      {},
      opts.headers || {},
      {
        "x-nexora-device":
          ensureDeviceId()
      }
    );

  return fetch(
    target,
    opts
  );
}

async function parseApiResponse(
  response
) {
  const text =
    await response.text();

  try {
    return JSON.parse(
      text
    );
  } catch {
    return {
      error:
        text ||
        "Resposta inválida do servidor."
    };
  }
}

function showToast(
  message
) {
  els.toast.textContent =
    message;

  els.toast.classList.add(
    "show"
  );

  clearTimeout(
    showToast.timer
  );

  showToast.timer =
    setTimeout(
      function() {
        els.toast.classList.remove(
          "show"
        );
      },
      3000
    );
}

function openModal(
  content
) {
  els.modalCard.innerHTML =
    content;

  els.modal.classList.remove(
    "hidden"
  );
}

function closeModal() {
  els.modal.classList.add(
    "hidden"
  );

  els.modalCard.innerHTML =
    "";
}

function updateUsageUi(
  usage
) {
  const data =
    usage || {};

  state.remaining =
    data.remaining === null ||
    data.remaining === undefined
      ? 100
      : Math.max(
          0,
          Number(
            data.remaining
          )
        );

  state.plan =
    data.plan &&
    data.plan.id
      ? data.plan.id
      : "free";

  state.persistent =
    Boolean(
      data.persistent
    );

  els.plan.textContent =
    "Free";

  els.credits.textContent =
    state.remaining +
    " créditos";

  const used =
    Math.max(
      0,
      100 -
      state.remaining
    );

  els.fill.style.width =
    Math.min(
      100,
      used
    ) +
    "%";
}

function resetChat() {
  state.mode =
    "chat";

  state.conversationId =
    makeId();

  state.messages =
    [];

  state.attachedFile =
    null;

  updateModeUi();
  renderMessages();
  renderAttachment();

  els.input.value =
    "";

  els.input.placeholder =
    "Mensagem para Nexora AI";

  autosize();
  closeSidebarMobile();
}

function setMode(
  mode
) {
  state.mode =
    mode || "chat";

  if (
    !state.conversationId
  ) {
    state.conversationId =
      makeId();
  }

  els.input.placeholder =
    state.mode ===
      "image-gen"
      ? "Descreve a imagem que queres gerar…"
      : state.mode ===
        "image"
        ? "Adiciona uma imagem e faz uma pergunta…"
        : "Mensagem para Nexora AI";

  updateModeUi();
  closeSidebarMobile();
}

function updateModeUi() {
  const label =
    MODE_NAMES[
      state.mode
    ] || "Chat";

  els.modePill.textContent =
    label +
    " ▾";

  els.topTitle.textContent =
    "Nexora AI";

  document
    .querySelectorAll(
      ".nav-item[data-mode]"
    )
    .forEach(
      function(button) {
        button.classList.toggle(
          "active",
          button.dataset.mode ===
            state.mode
        );
      }
    );
}

function renderMessages() {
  els.messages.innerHTML =
    "";

  els.welcome.style.display =
    state.messages.length
      ? "none"
      : "block";

  state.messages.forEach(
    renderMessage
  );

  scrollToBottom();
}

function renderMessage(
  message
) {
  const row =
    document.createElement(
      "div"
    );

  row.className =
    "message-row";

  const isUser =
    message.role ===
    "user";

  const avatar =
    document.createElement(
      "div"
    );

  avatar.className =
    "avatar " +
    (
      isUser
        ? "user"
        : "assistant"
    );

  avatar.textContent =
    isUser
      ? "Tu"
      : "N";

  const main =
    document.createElement(
      "div"
    );

  main.className =
    "message-main";

  const name =
    document.createElement(
      "div"
    );

  name.className =
    "message-name";

  name.textContent =
    isUser
      ? "Você"
      : "Nexora AI";

  const body =
    document.createElement(
      "div"
    );

  body.className =
    "message-body";

  if (
    message.image
  ) {
    body.innerHTML =
      message.text
        ? markdown(
            message.text
          )
        : "";

    const image =
      document.createElement(
        "img"
      );

    image.className =
      "generated-image";

    image.src =
      message.image;

    image.alt =
      "Imagem gerada por Nexora AI";

    body.appendChild(
      image
    );
  } else {
    body.innerHTML =
      markdown(
        message.content ||
        ""
      );
  }

  if (
    message.fileName
  ) {
    const chip =
      document.createElement(
        "div"
      );

    chip.className =
      "file-chip";

    chip.innerHTML =
      "□ <span>" +
      escapeHtml(
        message.fileName
      ) +
      "</span>";

    body.prepend(
      chip
    );
  }

  main.appendChild(
    name
  );

  main.appendChild(
    body
  );

  if (!isUser) {
    const tools =
      document.createElement(
        "div"
      );

    tools.className =
      "message-tools";

    const copy =
      document.createElement(
        "button"
      );

    copy.className =
      "mini-action";

    copy.textContent =
      "Copiar";

    copy.addEventListener(
      "click",
      async function() {
        try {
          await navigator.clipboard.writeText(
            message.content ||
            message.text ||
            ""
          );

          showToast(
            "Resposta copiada."
          );
        } catch {
          showToast(
            "Não foi possível copiar."
          );
        }
      }
    );

    const speak =
      document.createElement(
        "button"
      );

    speak.className =
      "mini-action";

    speak.textContent =
      "Ouvir";

    speak.addEventListener(
      "click",
      function() {
        speakText(
          message.content ||
          message.text ||
          ""
        );
      }
    );

    tools.appendChild(
      copy
    );

    if (
      message.content ||
      message.text
    ) {
      tools.appendChild(
        speak
      );
    }

    main.appendChild(
      tools
    );
  }

  row.appendChild(
    avatar
  );

  row.appendChild(
    main
  );

  els.messages.appendChild(
    row
  );
}

function addMessage(
  message
) {
  state.messages.push(
    message
  );

  renderMessages();
  persistLocalConversation();
}

function scrollToBottom() {
  requestAnimationFrame(
    function() {
      const area =
        document.getElementById(
          "chatScroll"
        );

      if (area) {
        area.scrollTop =
          area.scrollHeight;
      }
    }
  );
}

function autosize() {
  els.input.style.height =
    "auto";

  els.input.style.height =
    Math.min(
      170,
      els.input.scrollHeight
    ) +
    "px";
}

function titleFromFirstMessage() {
  const first =
    state.messages.find(
      function(item) {
        return (
          item.role ===
          "user"
        );
      }
    );

  return first &&
    first.content
    ? first.content.slice(
        0,
        54
      )
    : "Nova conversa";
}

function persistLocalConversation() {
  if (
    !state.conversationId ||
    !state.messages.length
  ) {
    return;
  }

  const current = {
    id:
      state.conversationId,
    title:
      titleFromFirstMessage(),
    updatedAt:
      new Date().toISOString(),
    messages:
      state.messages
        .slice(-80)
  };

  state.history = [
    current,
    ...state.history.filter(
      function(item) {
        return (
          item.id !==
          current.id
        );
      }
    )
  ].slice(
    0,
    40
  );

  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        state.history
      )
    );
  } catch {
    showToast(
      "O histórico local não pôde ser atualizado."
    );
  }

  renderHistory();
}

function loadLocalHistory() {
  try {
    state.history =
      JSON.parse(
        localStorage.getItem(
          STORAGE_KEY
        ) || "[]"
      );

    if (
      !Array.isArray(
        state.history
      )
    ) {
      state.history =
        [];
    }
  } catch {
    state.history =
      [];
  }

  renderHistory();
}

async function loadServerHistory() {
  try {
    const response =
      await apiFetch(
        "/api/history"
      );

    const data =
      await parseApiResponse(
        response
      );

    if (
      !response.ok ||
      !Array.isArray(
        data.conversations
      )
    ) {
      return;
    }

    data.conversations.forEach(
      function(remote) {
        const local =
          state.history.find(
            function(item) {
              return (
                item.id ===
                remote.id
              );
            }
          );

        if (local) {
          local.updatedAt =
            remote.updated_at ||
            local.updatedAt;

          local.title =
            remote.title ||
            local.title;
        } else {
          state.history.push(
            {
              id:
                remote.id,
              title:
                remote.title ||
                "Nova conversa",
              updatedAt:
                remote.updated_at,
              messages:
                []
            }
          );
        }
      }
    );

    state.history =
      state.history
        .sort(
          function(a, b) {
            return String(
              b.updatedAt || ""
            ).localeCompare(
              String(
                a.updatedAt || ""
              )
            );
          }
        )
        .slice(
          0,
          40
        );

    renderHistory();
  } catch {
    /* local history remains available */
  }
}

async function loadConversation(
  item
) {
  state.conversationId =
    item.id;

  if (
    !item.messages ||
    !item.messages.length
  ) {
    try {
      const response =
        await apiFetch(
          "/api/history/messages" +
          "?conversationId=" +
          encodeURIComponent(
            item.id
          )
        );

      const data =
        await parseApiResponse(
          response
        );

      if (
        response.ok &&
        Array.isArray(
          data.messages
        )
      ) {
        item.messages =
          data.messages.map(
            function(message) {
              return {
                role:
                  message.role,
                content:
                  message.content,
                fileName:
                  message.file_name ||
                  ""
              };
            }
          );
      }
    } catch {
      /* local fallback */
    }
  }

  state.messages =
    item.messages || [];

  state.mode =
    "chat";

  updateModeUi();
  renderMessages();
  closeSidebarMobile();
}

function renderHistory(
  filter
) {
  const query =
    String(filter || "")
      .trim()
      .toLowerCase();

  els.historyList.innerHTML =
    "";

  state.history
    .filter(
      function(item) {
        return (
          !query ||
          String(
            item.title || ""
          )
            .toLowerCase()
            .includes(query)
        );
      }
    )
    .forEach(
      function(item) {
        const button =
          document.createElement(
            "button"
          );

        button.className =
          "history-item" +
          (
            item.id ===
            state.conversationId
              ? " active"
              : ""
          );

        button.innerHTML =
          '<span class="history-dot"></span>' +
          "<span>" +
          escapeHtml(
            item.title ||
            "Nova conversa"
          ) +
          "</span>";

        button.addEventListener(
          "click",
          function() {
            loadConversation(
              item
            );
          }
        );

        els.historyList.appendChild(
          button
        );
      }
    );
}

function renderAttachment() {
  els.preview.innerHTML =
    "";

  if (
    !state.attachedFile
  ) {
    return;
  }

  const file =
    state.attachedFile;

  const chip =
    document.createElement(
      "div"
    );

  chip.className =
    "file-chip";

  const name =
    document.createElement(
      "span"
    );

  name.textContent =
    "□ " +
    file.name +
    " · " +
    Math.max(
      0.01,
      file.size /
        1024 /
        1024
    ).toFixed(2) +
    " MB";

  const remove =
    document.createElement(
      "button"
    );

  remove.textContent =
    "×";

  remove.className =
    "tiny-btn";

  remove.addEventListener(
    "click",
    function() {
      state.attachedFile =
        null;
      renderAttachment();
    }
  );

  chip.appendChild(
    name
  );

  chip.appendChild(
    remove
  );

  els.preview.appendChild(
    chip
  );
}

function isTextFile(
  file
) {
  if (!file) return false;

  const type =
    String(
      file.type || ""
    ).toLowerCase();

  const name =
    file.name.toLowerCase();

  return (
    type.startsWith(
      "text/"
    ) ||
    type ===
      "application/json" ||
    type ===
      "application/javascript" ||
    /\.(txt|md|csv|json|js|ts|py|html|css|java|c|cpp|h|xml|yaml|yml|srt)$/
      .test(name)
  );
}

function isDirectMediaFile(
  file
) {
  if (!file) return false;

  const type =
    String(
      file.type || ""
    ).toLowerCase();

  const name =
    file.name.toLowerCase();

  return (
    type ===
      "application/pdf" ||
    type.startsWith(
      "image/"
    ) ||
    type.startsWith(
      "audio/"
    ) ||
    type.startsWith(
      "video/"
    ) ||
    name.endsWith(
      ".pdf"
    )
  );
}

function autoModeForFile(
  file
) {
  if (!file) return;

  const type =
    String(
      file.type || ""
    ).toLowerCase();

  const name =
    file.name.toLowerCase();

  if (
    type ===
      "application/pdf" ||
    name.endsWith(
      ".pdf"
    )
  ) {
    state.mode =
      "pdf";
  } else if (
    type.startsWith(
      "image/"
    )
  ) {
    state.mode =
      "image";
  } else if (
    type.startsWith(
      "audio/"
    )
  ) {
    state.mode =
      "audio";
  } else if (
    type.startsWith(
      "video/"
    )
  ) {
    state.mode =
      "video";
  } else {
    state.mode =
      "documents";
  }

  updateModeUi();
}

function handleFile(
  file
) {
  if (!file) return;

  const max =
    12 *
    1024 *
    1024;

  if (
    file.size >
    max
  ) {
    showToast(
      "Usa ficheiros até 12 MB."
    );
    return;
  }

  if (
    !isDirectMediaFile(
      file
    ) &&
    !isTextFile(
      file
    )
  ) {
    showToast(
      "Formato não suportado. Usa PDF, imagem, áudio, vídeo ou ficheiro de texto."
    );
    return;
  }

  state.attachedFile =
    file;

  autoModeForFile(
    file
  );

  renderAttachment();
}

async function fileToText(
  file
) {
  const text =
    await file.text();

  return (
    "[Ficheiro: " +
    file.name +
    "]\n\n" +
    text.slice(
      0,
      40000
    )
  );
}

async function sendMessage(
  event
) {
  if (event) {
    event.preventDefault();
  }

  if (
    state.sending
  ) {
    return;
  }

  let text =
    els.input.value.trim();

  const file =
    state.attachedFile;

  if (
    !text &&
    !file
  ) {
    showToast(
      "Escreve algo ou adiciona um ficheiro."
    );
    return;
  }

  let uploadFile =
    file;

  if (
    file &&
    isTextFile(
      file
    )
  ) {
    try {
      const fileText =
        await fileToText(
          file
        );

      text =
        text
          ? text +
            "\n\n" +
            fileText
          : fileText;

      uploadFile =
        null;
    } catch {
      showToast(
        "Não foi possível ler o ficheiro de texto."
      );
      return;
    }
  }

  if (
    state.mode ===
    "image-gen"
  ) {
    await sendImageRequest(
      text,
      uploadFile
    );
    return;
  }

  const conversationId =
    state.conversationId ||
    makeId();

  state.conversationId =
    conversationId;

  const historyBefore =
    state.messages
      .slice(-12)
      .map(
        function(item) {
          return {
            role:
              item.role,
            content:
              item.content ||
              item.text ||
              ""
          };
        }
      );

  addMessage({
    role:
      "user",
    content:
      text,
    fileName:
      file
        ? file.name
        : ""
  });

  els.input.value =
    "";

  state.attachedFile =
    null;

  renderAttachment();
  autosize();
  setSending(true);

  const thinkingId =
    makeId();

  addThinkingMessage(
    thinkingId
  );

  try {
    await runChat(
      text,
      uploadFile,
      state.mode,
      conversationId,
      historyBefore
    );
  } catch (error) {
    addMessage({
      role:
        "assistant",
      content:
        error.message ||
        "Não consegui concluir o pedido."
    });
  } finally {
    removeThinkingMessage(
      thinkingId
    );
    setSending(false);
  }
}

async function runChat(
  text,
  file,
  mode,
  conversationId,
  history
) {
  const form =
    new FormData();

  form.append(
    "message",
    text
  );

  form.append(
    "mode",
    mode
  );

  form.append(
    "conversationId",
    conversationId
  );

  form.append(
    "title",
    text.slice(
      0,
      80
    ) ||
      "Análise de ficheiro"
  );

  form.append(
    "history",
    JSON.stringify(
      history
    )
  );

  if (file) {
    form.append(
      "file",
      file
    );
  }

  const response =
    await apiFetch(
      "/api/chat",
      {
        method:
          "POST",
        body:
          form
      }
    );

  const data =
    await parseApiResponse(
      response
    );

  if (
    !response.ok
  ) {
    throw new Error(
      data.error ||
      "Falha no processamento."
    );
  }

  addMessage({
    role:
      "assistant",
    content:
      data.answer ||
      ""
  });

  updateUsageUi({
    plan:
      data.plan,
    remaining:
      data.remaining,
    persistent:
      data.persistent
  });
}

async function sendImageRequest(
  prompt,
  file
) {
  if (
    !prompt
  ) {
    showToast(
      "Escreve a descrição da imagem."
    );
    return;
  }

  if (
    state.sending
  ) {
    return;
  }

  setSending(true);

  const thinkingId =
    makeId();

  addMessage({
    role:
      "user",
    content:
      prompt,
    fileName:
      file
        ? file.name
        : ""
  });

  els.input.value =
    "";

  state.attachedFile =
    null;

  renderAttachment();

  const form =
    new FormData();

  form.append(
    "prompt",
    prompt
  );

  if (file) {
    form.append(
      "file",
      file
    );
  }

  addThinkingMessage(
    thinkingId
  );

  try {
    const response =
      await apiFetch(
        "/api/image",
        {
          method:
            "POST",
          body:
            form
        }
      );

    const data =
      await parseApiResponse(
        response
      );

    if (
      !response.ok
    ) {
      throw new Error(
        data.error ||
        "A geração de imagem falhou."
      );
    }

    addMessage({
      role:
        "assistant",
      image:
        data.image,
      text:
        data.answer ||
        "Imagem gerada com Nexora AI."
    });

    updateUsageUi({
      plan:
        data.plan,
      remaining:
        data.remaining
    });
  } catch (error) {
    addMessage({
      role:
        "assistant",
      content:
        error.message ||
        "A geração de imagem falhou."
    });
  } finally {
    removeThinkingMessage(
      thinkingId
    );

    setSending(false);
  }
}

function setSending(
  value
) {
  state.sending =
    Boolean(value);

  els.send.disabled =
    state.sending;

  els.input.disabled =
    state.sending;

  els.attach.disabled =
    state.sending;

  els.camera.disabled =
    state.sending;
}

function addThinkingMessage(
  id
) {
  const row =
    document.createElement(
      "div"
    );

  row.className =
    "message-row";

  row.dataset.thinking =
    id;

  row.innerHTML =
    '<div class="avatar assistant">N</div>' +
    '<div class="message-main">' +
    '<div class="message-name">Nexora AI</div>' +
    '<div class="message-body">' +
    '<span class="loading">' +
    '<span class="loader"></span> A pensar…' +
    "</span>" +
    "</div>" +
    "</div>";

  els.messages.appendChild(
    row
  );

  scrollToBottom();
}

function removeThinkingMessage(
  id
) {
  const row =
    els.messages.querySelector(
      '[data-thinking="' +
      id +
      '"]'
    );

  if (row) {
    row.remove();
  }
}

async function speakText(
  text
) {
  if (!text) return;

  showToast(
    "A gerar voz…"
  );

  try {
    const response =
      await apiFetch(
        "/api/tts",
        {
          method:
            "POST",
          headers: {
            "content-type":
              "application/json"
          },
          body:
            JSON.stringify({
              text:
                text.slice(
                  0,
                  7000
                ),
              voice:
                "Kore"
            })
        }
      );

    if (
      !response.ok
    ) {
      const data =
        await parseApiResponse(
          response
        );

      showToast(
        data.error ||
        "Não foi possível gerar voz."
      );

      return;
    }

    const blob =
      await response.blob();

    const url =
      URL.createObjectURL(
        blob
      );

    const audio =
      new Audio(url);

    audio.onended =
      function() {
        URL.revokeObjectURL(
          url
        );
      };

    await audio.play();

    showToast(
      "A reproduzir voz."
    );
  } catch {
    showToast(
      "Não foi possível gerar voz."
    );
  }
}

function openToolPicker() {
  openModal(
    '<button class="modal-close" data-close-modal>×</button>' +
    "<h2>Escolher ferramenta</h2>" +
    "<p>Seleciona o modo desta conversa.</p>" +
    '<div class="plan-grid">' +
    Object.keys(
      MODE_NAMES
    )
      .map(
        function(key) {
          return (
            '<button class="quick-card tool-choice" ' +
            'data-mode-choice="' +
            key +
            '">' +
            "<strong>" +
            MODE_NAMES[key] +
            "</strong>" +
            "<small>Usar modo " +
            MODE_NAMES[key] +
            "</small></button>"
          );
        }
      )
      .join("") +
    "</div>"
  );

  document
    .querySelectorAll(
      "[data-mode-choice]"
    )
    .forEach(
      function(button) {
        button.addEventListener(
          "click",
          function() {
            setMode(
              button.dataset
                .modeChoice
            );

            closeModal();
          }
        );
      }
    );
}

function openAbout(
  type
) {
  const content = {
    about:
      "<h2>Sobre o Nexora AI</h2>" +
      "<p>Um espaço leve para conversar, estudar, escrever, programar e trabalhar com texto, imagens, áudio, vídeo e PDF.</p>" +
      "<div class='divider'></div>" +
      "<p>Frontend web leve, Cloudflare Workers no backend, D1 para persistência quando configurado e Google Gemini como motor de IA.</p>",
    privacy:
      "<h2>Privacidade</h2>" +
      "<p>Nesta fase não há contas Firebase. O app usa um identificador técnico de dispositivo para quotas e, quando D1 está configurado, para histórico. A chave Gemini fica apenas no Worker.</p>",
    terms:
      "<h2>Termos</h2>" +
      "<p>O Nexora AI é uma ferramenta de assistência. Confirma informações importantes antes de tomar decisões com base nas respostas.</p>"
  };

  openModal(
    '<button class="modal-close" data-close-modal>×</button>' +
    (
      content[type] ||
      content.about
    )
  );
}

function runHistorySearch() {
  openModal(
    '<button class="modal-close" data-close-modal>×</button>' +
    "<h2>Pesquisar histórico</h2>" +
    "<p>Procura pelo título das conversas guardadas neste dispositivo.</p>" +
    '<div class="search-box">' +
    '<input id="historyQuery" placeholder="Pesquisar…">' +
    "</div>"
  );

  const input =
    document.getElementById(
      "historyQuery"
    );

  input.focus();

  input.addEventListener(
    "input",
    function() {
      renderHistory(
        input.value
      );
    }
  );
}

function shareConversation() {
  const text =
    state.messages
      .map(
        function(item) {
          return (
            (
              item.role ===
              "user"
                ? "Você"
                : "Nexora AI"
            ) +
            ": " +
            (
              item.content ||
              item.text ||
              ""
            )
          );
        }
      )
      .join(
        "\n\n"
      );

  if (
    !text.trim()
  ) {
    showToast(
      "Não há mensagens para partilhar."
    );
    return;
  }

  if (
    navigator.share
  ) {
    navigator.share({
      title:
        "Nexora AI",
      text:
        text.slice(
          0,
          5000
        )
    }).catch(
      function() {}
    );

    return;
  }

  navigator.clipboard
    .writeText(
      text
    )
    .then(
      function() {
        showToast(
          "Conversa copiada."
        );
      }
    )
    .catch(
      function() {
        showToast(
          "Não foi possível partilhar."
        );
      }
    );
}

function openLiveVoice() {
  if (
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
  ) {
    showToast(
      "O navegador não permite acesso ao microfone."
    );
    return;
  }

  openModal(
    '<button class="modal-close" id="liveClose">×</button>' +
    "<h2>Voz em tempo real</h2>" +
    '<div class="voice-orb">◉</div>' +
    '<div class="live-state" id="liveState">A pedir sessão segura…</div>' +
    '<div class="message-body" id="liveTranscript"></div>' +
    '<div class="divider"></div>' +
    '<button class="primary-btn" id="liveStopBtn">Terminar conversa</button>'
  );

  document
    .getElementById(
      "liveClose"
    )
    .addEventListener(
      "click",
      stopLiveVoice
    );

  document
    .getElementById(
      "liveStopBtn"
    )
    .addEventListener(
      "click",
      stopLiveVoice
    );

  apiFetch(
    "/api/live-token",
    {
      method:
        "POST"
    }
  )
    .then(
      async function(response) {
        const data =
          await parseApiResponse(
            response
          );

        if (
          !response.ok ||
          !data.token
        ) {
          throw new Error(
            data.error ||
            "Não foi possível abrir a voz ao vivo."
          );
        }

        await startLiveVoice(
          data.token
        );
      }
    )
    .catch(
      function(error) {
        const node =
          document.getElementById(
            "liveState"
          );

        if (node) {
          node.textContent =
            error.message ||
            "Falha ao iniciar voz ao vivo.";
        }
      }
    );
}

async function startLiveVoice(
  token
) {
  const liveState =
    document.getElementById(
      "liveState"
    );

  const url =
    "wss://generativelanguage.googleapis.com/ws/" +
    "google.ai.generativelanguage.v1beta." +
    "GenerativeService.BidiGenerateContentConstrained" +
    "?access_token=" +
    encodeURIComponent(
      token
    );

  const ws =
    new WebSocket(
      url
    );

  state.live.ws =
    ws;

  ws.onopen =
    async function() {
      ws.send(
        JSON.stringify({
          setup: {
            model:
              "models/gemini-3.8-live",
            generationConfig: {
              responseModalities:
                ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName:
                      "Puck"
                  }
                }
              }
            },
            inputAudioTranscription: {},
            systemInstruction: {
              parts: [
                {
                  text:
                    "You are Nexora AI. Be helpful, natural, concise and speak in the user's language."
                }
              ]
            }
          }
        })
      );

      const AudioContextClass =
        window.AudioContext ||
        window.webkitAudioContext;

      if (!AudioContextClass) {
        throw new Error(
          "O navegador não suporta áudio."
        );
      }

      state.live.playbackContext =
        new AudioContextClass({
          sampleRate:
            24000
        });

      state.live.nextPlayTime =
        0;

      try {
        await startMicStream();

        state.live.connected =
          true;

        if (liveState) {
          liveState.textContent =
            "Ligado. Fala normalmente.";
        }
      } catch (error) {
        if (liveState) {
          liveState.textContent =
            "Microfone indisponível: " +
            error.message;
        }
      }
    };

  ws.onmessage =
    function(event) {
      let data;

      try {
        data =
          JSON.parse(
            event.data
          );
      } catch {
        return;
      }

      const content =
        data.serverContent ||
        {};

      if (
        content.interimInputTranscription
      ) {
        updateLiveTranscript(
          content
            .interimInputTranscription
            .text,
          false
        );
      }

      if (
        content.inputTranscription
      ) {
        updateLiveTranscript(
          content
            .inputTranscription
            .text,
          true
        );
      }

      const parts =
        content.modelTurn &&
        Array.isArray(
          content.modelTurn.parts
        )
          ? content.modelTurn.parts
          : [];

      parts.forEach(
        function(part) {
          const inline =
            part.inlineData ||
            part.inline_data;

          if (
            inline &&
            inline.data &&
            String(
              inline.mimeType ||
              inline.mime_type ||
              ""
            ).startsWith(
              "audio/"
            )
          ) {
            queuePcmAudio(
              inline.data
            );
          }

          if (part.text) {
            appendLiveText(
              part.text
            );
          }
        }
      );
    };

  ws.onerror =
    function() {
      if (liveState) {
        liveState.textContent =
          "Erro na ligação de voz.";
      }
    };

  ws.onclose =
    function() {
      state.live.connected =
        false;

      stopMicOnly();

      if (liveState) {
        liveState.textContent =
          "Conversa terminada.";
      }
    };
}

async function startMicStream() {
  const stream =
    await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount:
          1,
        echoCancellation:
          true,
        noiseSuppression:
          true,
        autoGainControl:
          true
      }
    });

  state.live.stream =
    stream;

  const AudioContextClass =
    window.AudioContext ||
    window.webkitAudioContext;

  state.live.audioContext =
    new AudioContextClass();

  const source =
    state.live.audioContext
      .createMediaStreamSource(
        stream
      );

  const processor =
    state.live.audioContext
      .createScriptProcessor(
        2048,
        1,
        1
      );

  state.live.processor =
    processor;

  processor.onaudioprocess =
    function(event) {
      if (
        !state.live.connected ||
        !state.live.ws ||
        state.live.ws.readyState !==
          WebSocket.OPEN
      ) {
        return;
      }

      const input =
        event.inputBuffer
          .getChannelData(0);

      const pcm =
        downsampleTo16k(
          input,
          state.live.audioContext
            .sampleRate
        );

      if (pcm.length) {
        state.live.ws.send(
          JSON.stringify({
            realtimeInput: {
              audio: {
                data:
                  typedArrayToBase64(
                    pcm
                  ),
                mimeType:
                  "audio/pcm;rate=16000"
              }
            }
          })
        );
      }
    };

  source.connect(
    processor
  );

  processor.connect(
    state.live.audioContext
      .destination
  );
}

function downsampleTo16k(
  input,
  sampleRate
) {
  if (
    sampleRate ===
    16000
  ) {
    const output =
      new Int16Array(
        input.length
      );

    for (
      let i = 0;
      i < input.length;
      i++
    ) {
      output[i] =
        Math.max(
          -1,
          Math.min(
            1,
            input[i]
          )
        ) *
        32767;
    }

    return output;
  }

  const ratio =
    sampleRate /
    16000;

  const length =
    Math.floor(
      input.length /
      ratio
    );

  const output =
    new Int16Array(
      length
    );

  let offset =
    0;

  for (
    let i = 0;
    i < length;
    i++
  ) {
    const next =
      Math.floor(
        (i + 1) *
        ratio
      );

    let sum =
      0;

    let count =
      0;

    for (
      let j = offset;
      j < next &&
      j < input.length;
      j++
    ) {
      sum +=
        input[j];

      count++;
    }

    const sample =
      count
        ? sum / count
        : 0;

    output[i] =
      Math.max(
        -1,
        Math.min(
          1,
          sample
        )
      ) *
      32767;

    offset =
      next;
  }

  return output;
}

function typedArrayToBase64(
  array
) {
  const bytes =
    new Uint8Array(
      array.buffer,
      array.byteOffset,
      array.byteLength
    );

  let binary =
    "";

  const chunk =
    0x8000;

  for (
    let i = 0;
    i < bytes.length;
    i += chunk
  ) {
    binary +=
      String.fromCharCode(
        ...bytes.subarray(
          i,
          Math.min(
            i + chunk,
            bytes.length
          )
        )
      );
  }

  return btoa(
    binary
  );
}

function queuePcmAudio(
  base64
) {
  const context =
    state.live
      .playbackContext;

  if (!context) {
    return;
  }

  const binary =
    atob(base64);

  const buffer =
    new ArrayBuffer(
      binary.length
    );

  const bytes =
    new Uint8Array(
      buffer
    );

  for (
    let i = 0;
    i < binary.length;
    i++
  ) {
    bytes[i] =
      binary.charCodeAt(i);
  }

  const pcm =
    new Int16Array(
      buffer
    );

  const audio =
    context.createBuffer(
      1,
      pcm.length,
      24000
    );

  const data =
    audio.getChannelData(
      0
    );

  for (
    let i = 0;
    i < pcm.length;
    i++
  ) {
    data[i] =
      pcm[i] /
      32768;
  }

  const source =
    context.createBufferSource();

  source.buffer =
    audio;

  source.connect(
    context.destination
  );

  const now =
    context.currentTime;

  state.live.nextPlayTime =
    Math.max(
      state.live.nextPlayTime ||
        0,
      now
    );

  source.start(
    state.live.nextPlayTime
  );

  state.live.nextPlayTime +=
    audio.duration;
}

function updateLiveTranscript(
  text,
  finalText
) {
  const node =
    document.getElementById(
      "liveTranscript"
    );

  if (
    !node ||
    !text
  ) {
    return;
  }

  node.innerHTML =
    finalText
      ? "<p><strong>Você:</strong> " +
        escapeHtml(text) +
        "</p>"
      : "<p><em>" +
        escapeHtml(text) +
        "</em></p>";
}

function appendLiveText(
  text
) {
  const node =
    document.getElementById(
      "liveTranscript"
    );

  if (
    !node ||
    !text
  ) {
    return;
  }

  node.innerHTML +=
    "<p><strong>Nexora:</strong> " +
    escapeHtml(text) +
    "</p>";

  node.scrollTop =
    node.scrollHeight;
}

function stopMicOnly() {
  if (
    state.live.processor
  ) {
    try {
      state.live.processor.disconnect();
    } catch {}

    state.live.processor =
      null;
  }

  if (
    state.live.audioContext
  ) {
    state.live.audioContext
      .close()
      .catch(
        function() {}
      );

    state.live.audioContext =
      null;
  }

  if (
    state.live.stream
  ) {
    state.live.stream
      .getTracks()
      .forEach(
        function(track) {
          track.stop();
        }
      );

    state.live.stream =
      null;
  }

  state.live.connected =
    false;
}

function stopLiveVoice() {
  if (
    state.live.ws
  ) {
    try {
      state.live.ws.close();
    } catch {}

    state.live.ws =
      null;
  }

  stopMicOnly();

  if (
    state.live.playbackContext
  ) {
    state.live.playbackContext
      .close()
      .catch(
        function() {}
      );

    state.live.playbackContext =
      null;
  }

  closeModal();
}

function runHistorySearch() {
  openModal(
    '<button class="modal-close" data-close-modal>×</button>' +
    "<h2>Pesquisar histórico</h2>" +
    "<p>Procura pelo título das conversas guardadas neste dispositivo.</p>" +
    '<div class="search-box">' +
    '<input id="historyQuery" placeholder="Pesquisar…">' +
    "</div>"
  );

  const input =
    document.getElementById(
      "historyQuery"
    );

  input.focus();

  input.addEventListener(
    "input",
    function() {
      renderHistory(
        input.value
      );
    }
  );
}

function clearAllHistory() {
  localStorage.removeItem(
    STORAGE_KEY
  );

  state.history =
    [];

  apiFetch(
    "/api/history",
    {
      method:
        "DELETE"
    }
  ).catch(
    function() {}
  );

  renderHistory();
  resetChat();

  showToast(
    "Histórico limpo."
  );
}

function shareConversation() {
  const text =
    state.messages
      .map(
        function(item) {
          return (
            (
              item.role ===
              "user"
                ? "Você"
                : "Nexora AI"
            ) +
            ": " +
            (
              item.content ||
              item.text ||
              ""
            )
          );
        }
      )
      .join(
        "\n\n"
      );

  if (
    !text.trim()
  ) {
    showToast(
      "Não há mensagens para partilhar."
    );
    return;
  }

  if (
    navigator.share
  ) {
    navigator
      .share({
        title:
          "Nexora AI",
        text:
          text.slice(
            0,
            5000
          )
      })
      .catch(
        function() {}
      );

    return;
  }

  navigator.clipboard
    .writeText(
      text
    )
    .then(
      function() {
        showToast(
          "Conversa copiada."
        );
      }
    )
    .catch(
      function() {
        showToast(
          "Não foi possível partilhar."
        );
      }
    );
}

function closeSidebarMobile() {
  els.sidebar.classList.remove(
    "open"
  );
}

function startBrowserDictation() {
  const Recognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (!Recognition) {
    showToast(
      "O ditado não está disponível neste navegador."
    );
    return;
  }

  const recognition =
    new Recognition();

  recognition.lang =
    navigator.language ||
    "pt-PT";

  recognition.interimResults =
    false;

  recognition.continuous =
    false;

  recognition.onstart =
    function() {
      els.mic.textContent =
        "●";

      showToast(
        "Estou a ouvir…"
      );
    };

  recognition.onresult =
    function(event) {
      const result =
        event.results[0][0]
          .transcript;

      els.input.value =
        (
          els.input.value
            ? els.input.value +
              " "
            : ""
        ) +
        result;

      autosize();
      els.input.focus();
    };

  recognition.onerror =
    function() {
      showToast(
        "Não foi possível usar o ditado."
      );
    };

  recognition.onend =
    function() {
      els.mic.textContent =
        "◉";
    };

  try {
    recognition.start();
  } catch {
    showToast(
      "O ditado já está ativo."
    );
  }
}

function bindEvents() {
  els.composer.addEventListener(
    "submit",
    sendMessage
  );

  els.send.addEventListener(
    "click",
    sendMessage
  );

  els.input.addEventListener(
    "input",
    autosize
  );

  els.input.addEventListener(
    "keydown",
    function(event) {
      if (
        event.key ===
          "Enter" &&
        !event.shiftKey &&
        window.innerWidth >
          620
      ) {
        event.preventDefault();
        sendMessage(event);
      }
    }
  );

  els.attach.addEventListener(
    "click",
    function() {
      els.file.click();
    }
  );

  els.camera.addEventListener(
    "click",
    function() {
      els.cameraInput.click();
    }
  );

  els.file.addEventListener(
    "change",
    function() {
      handleFile(
        els.file.files[0]
      );

      els.file.value =
        "";
    }
  );

  els.cameraInput.addEventListener(
    "change",
    function() {
      handleFile(
        els.cameraInput.files[0]
      );

      els.cameraInput.value =
        "";
    }
  );

  els.modePill.addEventListener(
    "click",
    openToolPicker
  );

  els.newChat.addEventListener(
    "click",
    resetChat
  );

  els.clearHistory.addEventListener(
    "click",
    clearAllHistory
  );

  els.historySearch.addEventListener(
    "click",
    runHistorySearch
  );

  els.share.addEventListener(
    "click",
    shareConversation
  );

  els.openSidebar.addEventListener(
    "click",
    function() {
      els.sidebar.classList.add(
        "open"
      );
    }
  );

  els.closeSidebar.addEventListener(
    "click",
    closeSidebarMobile
  );

  document.addEventListener(
    "click",
    function(event) {
      const modeButton =
        event.target.closest(
          ".nav-item[data-mode]"
        );

      if (
        modeButton
      ) {
        setMode(
          modeButton.dataset
            .mode
        );

        return;
      }

      const action =
        event.target.closest(
          "[data-action]"
        );

      if (!action) {
        return;
      }

      const name =
        action.dataset.action;

      if (
        name ===
        "generate-image"
      ) {
        setMode(
          "image-gen"
        );
      }

      if (
        name ===
        "voice-live"
      ) {
        openLiveVoice();
      }

      if (
        name ===
        "about"
      ) {
        openAbout(
          "about"
        );
      }

      if (
        name ===
        "privacy"
      ) {
        openAbout(
          "privacy"
        );
      }

      if (
        name ===
        "terms"
      ) {
        openAbout(
          "terms"
        );
      }
    }
  );

  document.addEventListener(
    "click",
    function(event) {
      if (
        event.target.hasAttribute(
          "data-close-modal"
        )
      ) {
        closeModal();
      }
    }
  );

  els.mic.addEventListener(
    "click",
    startBrowserDictation
  );

  document
    .querySelectorAll(
      ".quick-card[data-preset]"
    )
    .forEach(
      function(card) {
        card.addEventListener(
          "click",
          function() {
            els.input.value =
              card.dataset
                .preset;

            autosize();
            els.input.focus();
          }
        );
      }
    );
}

async function boot() {
  ensureDeviceId();

  state.conversationId =
    makeId();

  loadLocalHistory();
  bindEvents();
  updateModeUi();
  autosize();

  try {
    const health =
      await apiFetch(
        "/api/health"
      );

    const data =
      await parseApiResponse(
        health
      );

    if (!health.ok) {
      showToast(
        data.error ||
        "Backend indisponível."
      );
    } else if (
      !data.geminiConfigured
    ) {
      showToast(
        "Backend ligado, mas GEMINI_API_KEY ainda não foi configurada."
      );
    }
  } catch {
    showToast(
      "Backend ainda não está disponível. A interface continua disponível."
    );
  }

  try {
    const usage =
      await apiFetch(
        "/api/usage"
      );

    if (
      usage.ok
    ) {
      const data =
        await parseApiResponse(
          usage
        );

      updateUsageUi(
        data
      );
    }
  } catch {}

  await loadServerHistory();
}

boot();
