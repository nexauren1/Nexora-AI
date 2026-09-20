
const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
  "access-control-allow-headers":
    "content-type, x-nexora-device",
  "access-control-max-age": "86400"
};

const PLANS = {
  free: {
    id: "free",
    name: "Free",
    price: 0,
    monthlyCredits: 100
  }
};

const MODE_PROMPTS = {
  chat:
    "You are Nexora AI, a helpful and accurate general assistant. Answer in the user's language.",
  work:
    "Act as a professional writing and work assistant. Help draft, rewrite, plan, organize and produce polished useful outputs. Answer in the user's language.",
  summary:
    "Summarize the provided material clearly. Extract key ideas, important facts, action points and study notes when useful. Answer in the user's language.",
  pdf:
    "Analyze the provided PDF. Explain its content, answer questions about it and extract key sections or study notes. Answer in the user's language.",
  documents:
    "Analyze the provided document or text. Extract meaning, structure and important details. Answer in the user's language.",
  image:
    "Analyze the provided image carefully. Describe visible content, read legible text and explain charts or diagrams. Do not invent details.",
  audio:
    "Analyze the provided audio when supported. Transcribe or summarize useful details without inventing content.",
  video:
    "Analyze the provided video when supported. Summarize visible or audible information without inventing details.",
  code:
    "Act as a careful software engineering assistant. Provide working, secure and maintainable solutions and debug errors accurately.",
  qa:
    "Answer the user's question directly and accurately. Explain when useful and state uncertainty when needed."
};

const COSTS = {
  chat: 1,
  file: 2,
  video: 4,
  image: 10,
  tts: 5,
  live: 3
};

let schemaPromise = null;

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign(
      {},
      JSON_HEADERS,
      CORS_HEADERS,
      extra
    )
  });
}

function getDeviceId(request) {
  const header =
    request.headers.get("x-nexora-device") || "";

  if (/^[a-zA-Z0-9_-]{16,100}$/.test(header)) {
    return header;
  }

  const cookie =
    request.headers.get("cookie") || "";

  const match = cookie.match(
    /(?:^|;\s*)nexora_device=([^;]+)/
  );

  if (
    match &&
    /^[a-zA-Z0-9_-]{16,100}$/.test(match[1])
  ) {
    return match[1];
  }

  return crypto.randomUUID().replaceAll("-", "");
}

function deviceHeaders(deviceId) {
  return {
    "set-cookie":
      "nexora_device=" +
      deviceId +
      "; Path=/; Max-Age=31536000; SameSite=Lax; Secure"
  };
}

function textError(message, status = 400) {
  return json(
    {
      error: message
    },
    status
  );
}

async function ensureDb(env) {
  if (!env.DB) return false;

  if (!schemaPromise) {
    schemaPromise = env.DB
      .batch([
        env.DB.prepare(
          "CREATE TABLE IF NOT EXISTS plans (" +
          "id TEXT PRIMARY KEY, " +
          "name TEXT NOT NULL, " +
          "price_usd INTEGER NOT NULL DEFAULT 0, " +
          "billing_interval TEXT NOT NULL DEFAULT 'month', " +
          "monthly_credits INTEGER NOT NULL DEFAULT 0, " +
          "active INTEGER NOT NULL DEFAULT 1, " +
          "created_at TEXT NOT NULL, " +
          "updated_at TEXT NOT NULL)"
        ),
        env.DB.prepare(
          "CREATE TABLE IF NOT EXISTS anonymous_state (" +
          "device_id TEXT PRIMARY KEY, " +
          "plan_id TEXT NOT NULL DEFAULT 'free', " +
          "monthly_credits_balance INTEGER NOT NULL DEFAULT 100, " +
          "used_this_period INTEGER NOT NULL DEFAULT 0, " +
          "period_start TEXT NOT NULL, " +
          "period_end TEXT NOT NULL, " +
          "created_at TEXT NOT NULL, " +
          "updated_at TEXT NOT NULL)"
        ),
        env.DB.prepare(
          "CREATE TABLE IF NOT EXISTS conversations (" +
          "id TEXT PRIMARY KEY, " +
          "device_id TEXT NOT NULL, " +
          "title TEXT NOT NULL, " +
          "created_at TEXT NOT NULL, " +
          "updated_at TEXT NOT NULL)"
        ),
        env.DB.prepare(
          "CREATE TABLE IF NOT EXISTS messages (" +
          "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
          "conversation_id TEXT NOT NULL, " +
          "device_id TEXT NOT NULL, " +
          "role TEXT NOT NULL, " +
          "content TEXT NOT NULL, " +
          "file_name TEXT, " +
          "created_at TEXT NOT NULL)"
        ),
        env.DB.prepare(
          "CREATE TABLE IF NOT EXISTS activities (" +
          "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
          "device_id TEXT NOT NULL, " +
          "feature TEXT NOT NULL, " +
          "action TEXT NOT NULL, " +
          "credits_used INTEGER NOT NULL DEFAULT 0, " +
          "status TEXT NOT NULL DEFAULT 'success', " +
          "request_id TEXT, " +
          "metadata TEXT, " +
          "created_at TEXT NOT NULL)"
        ),
        env.DB.prepare(
          "CREATE TABLE IF NOT EXISTS credit_ledger (" +
          "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
          "device_id TEXT NOT NULL, " +
          "bucket TEXT NOT NULL, " +
          "entry_type TEXT NOT NULL, " +
          "amount INTEGER NOT NULL, " +
          "source TEXT NOT NULL, " +
          "reference_id TEXT, " +
          "expires_at TEXT, " +
          "created_at TEXT NOT NULL)"
        ),
        env.DB.prepare(
          "CREATE INDEX IF NOT EXISTS " +
          "idx_messages_conversation " +
          "ON messages(conversation_id, created_at)"
        ),
        env.DB.prepare(
          "CREATE INDEX IF NOT EXISTS " +
          "idx_history_device " +
          "ON conversations(device_id, updated_at)"
        ),
        env.DB.prepare(
          "CREATE INDEX IF NOT EXISTS " +
          "idx_activity_device " +
          "ON activities(device_id, created_at)"
        ),
        env.DB.prepare(
          "CREATE UNIQUE INDEX IF NOT EXISTS " +
          "idx_activity_request " +
          "ON activities(request_id) " +
          "WHERE request_id IS NOT NULL"
        ),
        env.DB.prepare(
          "INSERT INTO plans " +
          "(id, name, price_usd, billing_interval, " +
          "monthly_credits, active, created_at, updated_at) " +
          "VALUES " +
          "('free','Free',0,'month',100,1," +
          "CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) " +
          "ON CONFLICT(id) DO UPDATE SET " +
          "name=excluded.name, " +
          "price_usd=excluded.price_usd, " +
          "monthly_credits=excluded.monthly_credits, " +
          "active=excluded.active, " +
          "updated_at=excluded.updated_at"
        )
      ])
      .catch(function(error) {
        schemaPromise = null;
        throw error;
      });
  }

  await schemaPromise;
  return true;
}

function periodDates(now) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  return {
    start: new Date(
      Date.UTC(year, month, 1)
    ).toISOString(),
    end: new Date(
      Date.UTC(year, month + 1, 1)
    ).toISOString()
  };
}

async function ensureAnonymousState(
  env,
  deviceId
) {
  const now = new Date();
  const dates = periodDates(now);
  const nowIso = now.toISOString();

  await env.DB.prepare(
    "INSERT INTO anonymous_state " +
    "(device_id, plan_id, monthly_credits_balance, " +
    "used_this_period, period_start, period_end, " +
    "created_at, updated_at) " +
    "VALUES (?, 'free', 100, 0, ?, ?, ?, ?) " +
    "ON CONFLICT(device_id) DO NOTHING"
  ).bind(
    deviceId,
    dates.start,
    dates.end,
    nowIso,
    nowIso
  ).run();

  let state = await env.DB.prepare(
    "SELECT device_id, plan_id, " +
    "monthly_credits_balance, used_this_period, " +
    "period_start, period_end " +
    "FROM anonymous_state WHERE device_id = ?"
  ).bind(deviceId).first();

  if (!state) {
    throw new Error(
      "Não foi possível criar o estado do dispositivo."
    );
  }

  if (
    !state.period_end ||
    new Date(state.period_end) <= now
  ) {
    await env.DB.prepare(
      "UPDATE anonymous_state SET " +
      "monthly_credits_balance = 100, " +
      "used_this_period = 0, " +
      "period_start = ?, period_end = ?, " +
      "plan_id = 'free', updated_at = ? " +
      "WHERE device_id = ?"
    ).bind(
      dates.start,
      dates.end,
      nowIso,
      deviceId
    ).run();

    state = await env.DB.prepare(
      "SELECT device_id, plan_id, " +
      "monthly_credits_balance, used_this_period, " +
      "period_start, period_end " +
      "FROM anonymous_state WHERE device_id = ?"
    ).bind(deviceId).first();
  }

  return state;
}

async function getUsage(env, deviceId) {
  if (!env.DB) {
    return {
      plan: PLANS.free,
      remaining: 100,
      used: 0,
      persistent: false
    };
  }

  await ensureDb(env);

  const state =
    await ensureAnonymousState(
      env,
      deviceId
    );

  const remaining =
    Math.max(
      0,
      Number(state.monthly_credits_balance)
    );

  return {
    plan:
      PLANS[state.plan_id] ||
      PLANS.free,
    remaining: remaining,
    used:
      Math.max(
        0,
        100 - remaining
      ),
    periodEnd:
      state.period_end,
    persistent:
      true
  };
}

async function consumeCredits(
  env,
  deviceId,
  feature,
  cost
) {
  if (!env.DB) {
    return {
      allowed: true,
      plan: PLANS.free,
      remaining: null,
      persistent: false
    };
  }

  await ensureDb(env);

  await ensureAnonymousState(
    env,
    deviceId
  );

  const nowIso =
    new Date().toISOString();

  const update =
    await env.DB.prepare(
      "UPDATE anonymous_state SET " +
      "monthly_credits_balance = " +
      "monthly_credits_balance - ?, " +
      "used_this_period = " +
      "used_this_period + ?, " +
      "updated_at = ? " +
      "WHERE device_id = ? " +
      "AND monthly_credits_balance >= ?"
    ).bind(
      cost,
      cost,
      nowIso,
      deviceId,
      cost
    ).run();

  const changed =
    Number(
      update.meta &&
      update.meta.changes
    ) || 0;

  const usage =
    await getUsage(
      env,
      deviceId
    );

  if (!changed) {
    return {
      allowed: false,
      plan: usage.plan,
      remaining: usage.remaining,
      persistent: true
    };
  }

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO credit_ledger " +
      "(device_id, bucket, entry_type, amount, " +
      "source, created_at) " +
      "VALUES (?, 'monthly', 'usage', ?, ?, ?)"
    ).bind(
      deviceId,
      -cost,
      feature,
      nowIso
    ),
    env.DB.prepare(
      "INSERT INTO activities " +
      "(device_id, feature, action, credits_used, " +
      "status, created_at) " +
      "VALUES (?, ?, 'use', ?, 'success', ?)"
    ).bind(
      deviceId,
      feature,
      cost,
      nowIso
    )
  ]);

  return {
    allowed: true,
    plan: usage.plan,
    remaining:
      Math.max(
        0,
        usage.remaining
      ),
    persistent: true
  };
}

function buildSystem(mode) {
  return (
    MODE_PROMPTS[mode] ||
    MODE_PROMPTS.chat
  ) +
    "\nNever claim to have used a tool, source or file you did not use." +
    "\nDo not invent facts, file contents or media details." +
    "\nKeep the answer useful and clear.";
}

async function geminiFetch(
  env,
  path,
  body
) {
  if (!env.GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY não está configurada no Cloudflare."
    );
  }

  const response =
    await fetch(
      "https://generativelanguage.googleapis.com/" +
      "v1beta/" +
      path,
      {
        method: "POST",
        headers: {
          "content-type":
            "application/json",
          "x-goog-api-key":
            env.GEMINI_API_KEY
        },
        body:
          JSON.stringify(body)
      }
    );

  const raw =
    await response.text();

  let data;

  try {
    data =
      JSON.parse(raw);
  } catch {
    data = {
      error: {
        message: raw
      }
    };
  }

  if (!response.ok) {
    const error =
      new Error(
        data.error &&
        data.error.message
          ? data.error.message
          : "Gemini error " +
            response.status
      );

    error.status =
      response.status;

    throw error;
  }

  return data;
}

function collectText(data) {
  const parts =
    data &&
    data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    Array.isArray(
      data.candidates[0].content.parts
    )
      ? data.candidates[0].content.parts
      : [];

  return parts
    .map(function(part) {
      return part && part.text
        ? part.text
        : "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function collectImage(data) {
  const parts =
    data &&
    data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    Array.isArray(
      data.candidates[0].content.parts
    )
      ? data.candidates[0].content.parts
      : [];

  for (const part of parts) {
    const inline =
      part &&
      (part.inlineData ||
        part.inline_data);

    if (
      inline &&
      inline.data
    ) {
      return {
        mimeType:
          inline.mimeType ||
          inline.mime_type ||
          "image/png",
        data:
          inline.data
      };
    }
  }

  return null;
}

function base64ToBytes(value) {
  const binary =
    atob(
      String(value || "")
    );

  const bytes =
    new Uint8Array(
      binary.length
    );

  for (
    let i = 0;
    i < binary.length;
    i++
  ) {
    bytes[i] =
      binary.charCodeAt(i);
  }

  return bytes;
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;

  for (
    let index = 0;
    index < bytes.length;
    index += chunk
  ) {
    binary +=
      String.fromCharCode(
        ...bytes.subarray(
          index,
          Math.min(
            index + chunk,
            bytes.length
          )
        )
      );
  }

  return btoa(binary);
}

function pcmToWav(
  pcmBase64,
  sampleRate = 24000,
  channels = 1
) {
  const binary =
    atob(pcmBase64);

  const pcm =
    new Uint8Array(
      binary.length
    );

  for (
    let i = 0;
    i < binary.length;
    i++
  ) {
    pcm[i] =
      binary.charCodeAt(i);
  }

  const header =
    new ArrayBuffer(44);

  const view =
    new DataView(header);

  const blockAlign =
    channels * 2;

  const byteRate =
    sampleRate *
    blockAlign;

  function writeText(
    offset,
    value
  ) {
    for (
      let i = 0;
      i < value.length;
      i++
    ) {
      view.setUint8(
        offset + i,
        value.charCodeAt(i)
      );
    }
  }

  writeText(0, "RIFF");

  view.setUint32(
    4,
    36 + pcm.length,
    true
  );

  writeText(8, "WAVE");
  writeText(12, "fmt ");

  view.setUint32(
    16,
    16,
    true
  );

  view.setUint16(
    20,
    1,
    true
  );

  view.setUint16(
    22,
    channels,
    true
  );

  view.setUint32(
    24,
    sampleRate,
    true
  );

  view.setUint32(
    28,
    byteRate,
    true
  );

  view.setUint16(
    32,
    blockAlign,
    true
  );

  view.setUint16(
    34,
    16,
    true
  );

  writeText(36, "data");

  view.setUint32(
    40,
    pcm.length,
    true
  );

  const output =
    new Uint8Array(
      44 + pcm.length
    );

  output.set(
    new Uint8Array(header),
    0
  );

  output.set(
    pcm,
    44
  );

  return output;
}

async function saveMessage(
  env,
  deviceId,
  conversationId,
  title,
  role,
  content,
  fileName
) {
  if (
    !env.DB ||
    !conversationId ||
    !content
  ) {
    return;
  }

  const nowIso =
    new Date().toISOString();

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO conversations " +
      "(id, device_id, title, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, ?) " +
      "ON CONFLICT(id) DO UPDATE SET " +
      "title=excluded.title, " +
      "updated_at=excluded.updated_at"
    ).bind(
      conversationId,
      deviceId,
      title ||
        "Nova conversa",
      nowIso,
      nowIso
    ),
    env.DB.prepare(
      "INSERT INTO messages " +
      "(conversation_id, device_id, role, content, " +
      "file_name, created_at) " +
      "VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(
      conversationId,
      deviceId,
      role,
      content.slice(0, 50000),
      fileName || null,
      nowIso
    )
  ]);
}

async function handleChat(
  request,
  env,
  ctx
) {
  const deviceId =
    getDeviceId(request);

  const contentType =
    request.headers.get(
      "content-type"
    ) || "";

  let body = {};
  let file = null;

  try {
    if (
      contentType.includes(
        "multipart/form-data"
      )
    ) {
      const form =
        await request.formData();

      let history = [];
      const rawHistory =
        form.get("history");

      if (rawHistory) {
        try {
          history =
            JSON.parse(
              String(rawHistory)
            );
        } catch {
          history = [];
        }
      }

      body = {
        message:
          String(
            form.get("message") ||
              ""
          ),
        mode:
          String(
            form.get("mode") ||
              "chat"
          ),
        conversationId:
          String(
            form.get("conversationId") ||
              ""
          ),
        title:
          String(
            form.get("title") ||
              "Nova conversa"
          ),
        history:
          history
      };

      const candidate =
        form.get("file");

      if (
        candidate &&
        typeof candidate.arrayBuffer ===
          "function"
      ) {
        file = candidate;
      }
    } else {
      body =
        await request.json();

      if (
        body &&
        body.fileBytes &&
        body.fileName
      ) {
        const bytes =
          base64ToBytes(
            String(body.fileBytes)
          );

        file =
          new File(
            [bytes],
            String(
              body.fileName
            ).slice(0, 255),
            {
              type:
                String(
                  body.mimeType ||
                  "application/octet-stream"
                )
            }
          );
      }
    }
  } catch {
    return textError(
      "Pedido inválido.",
      400
    );
  }

  const message =
    String(
      body.message || ""
    ).trim();

  const mode =
    String(
      body.mode || "chat"
    );

  const history =
    Array.isArray(body.history)
      ? body.history
      : [];

  if (
    !message &&
    !file
  ) {
    return textError(
      "Escreve uma mensagem ou envia um ficheiro."
    );
  }

  if (
    !MODE_PROMPTS[mode]
  ) {
    return textError(
      "Modo de ferramenta inválido.",
      400
    );
  }

  if (file) {
    const maxBytes =
      12 * 1024 * 1024;

    if (
      file.size >
      maxBytes
    ) {
      return json(
        {
          error:
            "Este app aceita ficheiros até 12 MB por pedido."
        },
        413,
        deviceHeaders(
          deviceId
        )
      );
    }

    const type =
      String(
        file.type || ""
      );

    const supported =
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
      );

    if (!supported) {
      return json(
        {
          error:
            "Formato não suportado para envio direto. Usa PDF, imagem, áudio ou vídeo."
        },
        415,
        deviceHeaders(
          deviceId
        )
      );
    }
  }

  const cost =
    file
      ? mode === "video"
        ? COSTS.video
        : COSTS.file
      : COSTS[mode] ||
        COSTS.chat;

  if (!env.GEMINI_API_KEY) {
    return json(
      {
        error:
          "GEMINI_API_KEY não está configurada no Cloudflare.",
        code:
          "GEMINI_NOT_CONFIGURED"
      },
      503,
      deviceHeaders(
        deviceId
      )
    );
  }

  const credit =
    await consumeCredits(
      env,
      deviceId,
      file
        ? "analyze_" + mode
        : mode,
      cost
    );

  if (!credit.allowed) {
    return json(
      {
        error:
          "Os 100 créditos gratuitos deste mês foram usados.",
        code:
          "CREDITS_EXHAUSTED",
        plan:
          credit.plan,
        remaining:
          credit.remaining
      },
      402,
      deviceHeaders(
        deviceId
      )
    );
  }

  const contents = [];

  for (
    const item of
    history.slice(-12)
  ) {
    if (
      !item ||
      !item.content
    ) {
      continue;
    }

    contents.push({
      role:
        item.role ===
        "assistant"
          ? "model"
          : "user",
      parts: [
        {
          text:
            String(
              item.content
            ).slice(0, 12000)
        }
      ]
    });
  }

  const parts = [];

  if (message) {
    parts.push({
      text:
        message
    });
  }

  let fileName = "";

  if (file) {
    fileName =
      String(
        file.name || ""
      ).slice(0, 255);

    const bytes =
      new Uint8Array(
        await file.arrayBuffer()
      );

    parts.push({
      inlineData: {
        mimeType:
          file.type ||
          "application/octet-stream",
        data:
          bytesToBase64(
            bytes
          )
      }
    });
  }

  contents.push({
    role:
      "user",
    parts:
      parts
  });

  try {
    const data =
      await geminiFetch(
        env,
        "models/gemini-3.8-flash:generateContent",
        {
          systemInstruction: {
            parts: [
              {
                text:
                  buildSystem(
                    mode
                  )
              }
            ]
          },
          contents:
            contents,
          generationConfig: {
            temperature:
              0.5,
            maxOutputTokens:
              4096
          }
        }
      );

    const answer =
      collectText(data) ||
      "Não consegui produzir uma resposta útil.";

    const conversationId =
      String(
        body.conversationId ||
          ""
      ).slice(0, 120);

    const title =
      String(
        body.title ||
          message.slice(0, 70) ||
          "Nova conversa"
      ).slice(
        0,
        120
      );

    ctx.waitUntil(
      Promise.all([
        saveMessage(
          env,
          deviceId,
          conversationId,
          title,
          "user",
          message ||
            "Analisar ficheiro",
          fileName
        ),
        saveMessage(
          env,
          deviceId,
          conversationId,
          title,
          "assistant",
          answer,
          ""
        )
      ]).catch(
        function() {}
      )
    );

    return json(
      {
        ok:
          true,
        answer:
          answer,
        plan:
          credit.plan,
        remaining:
          credit.remaining,
        persistent:
          credit.persistent,
        conversationId:
          conversationId
      },
      200,
      deviceHeaders(
        deviceId
      )
    );
  } catch (error) {
    return json(
      {
        error:
          error &&
          error.message
            ? error.message
            : "Falha ao contactar o Gemini.",
        code:
          "GEMINI_ERROR"
      },
      error.status || 502,
      deviceHeaders(
        deviceId
      )
    );
  }
}

async function handleImage(
  request,
  env
) {
  const deviceId =
    getDeviceId(request);

  const contentType =
    request.headers.get(
      "content-type"
    ) || "";

  let prompt = "";
  let file = null;

  try {
    if (
      contentType.includes(
        "multipart/form-data"
      )
    ) {
      const form =
        await request.formData();

      prompt =
        String(
          form.get("prompt") ||
            ""
        ).trim();

      const candidate =
        form.get("file");

      if (
        candidate &&
        typeof candidate.arrayBuffer ===
          "function"
      ) {
        file =
          candidate;
      }
    } else {
      const body =
        await request.json();

      prompt =
        String(
          body.prompt ||
            ""
        ).trim();
    }
  } catch {
    return textError(
      "Pedido de imagem inválido."
    );
  }

  if (!prompt) {
    return textError(
      "Escreve a descrição da imagem."
    );
  }

  if (!env.GEMINI_API_KEY) {
    return json(
      {
        error:
          "GEMINI_API_KEY não está configurada no Cloudflare.",
        code:
          "GEMINI_NOT_CONFIGURED"
      },
      503,
      deviceHeaders(
        deviceId
      )
    );
  }

  const credit =
    await consumeCredits(
      env,
      deviceId,
      "image_generation",
      COSTS.image
    );

  if (!credit.allowed) {
    return json(
      {
        error:
          "Os 100 créditos gratuitos deste mês foram usados.",
        code:
          "CREDITS_EXHAUSTED",
        remaining:
          credit.remaining
      },
      402,
      deviceHeaders(
        deviceId
      )
    );
  }

  const parts = [
    {
      text:
        prompt
    }
  ];

  if (file) {
    if (
      file.size >
      10 * 1024 * 1024
    ) {
      return json(
        {
          error:
            "A imagem de referência deve ter até 10 MB."
        },
        413,
        deviceHeaders(
          deviceId
        )
      );
    }

    if (
      !String(
        file.type || ""
      ).startsWith(
        "image/"
      )
    ) {
      return textError(
        "A referência precisa ser uma imagem.",
        415
      );
    }

    const bytes =
      new Uint8Array(
        await file.arrayBuffer()
      );

    parts.push({
      inlineData: {
        mimeType:
          file.type ||
          "image/jpeg",
        data:
          bytesToBase64(
            bytes
          )
      }
    });
  }

  try {
    const data =
      await geminiFetch(
        env,
        "models/gemini-3.1-flash-image:generateContent",
        {
          contents: [
            {
              role:
                "user",
              parts:
                parts
            }
          ],
          generationConfig: {
            responseModalities: [
              "TEXT",
              "IMAGE"
            ]
          }
        }
      );

    const image =
      collectImage(data);

    const text =
      collectText(data);

    if (!image) {
      return json(
        {
          error:
            "O modelo não devolveu uma imagem.",
          details:
            text ||
            null
        },
        502,
        deviceHeaders(
          deviceId
        )
      );
    }

    return json(
      {
        ok:
          true,
        image:
          "data:" +
          image.mimeType +
          ";base64," +
          image.data,
        answer:
          text ||
          "Imagem gerada com Nexora AI.",
        model:
          "gemini-3.1-flash-image",
        plan:
          credit.plan,
        remaining:
          credit.remaining
      },
      200,
      deviceHeaders(
        deviceId
      )
    );
  } catch (error) {
    return json(
      {
        error:
          error &&
          error.message
            ? error.message
            : "A geração de imagem falhou.",
        code:
          "IMAGE_GENERATION_ERROR"
      },
      error.status || 502,
      deviceHeaders(
        deviceId
      )
    );
  }
}

async function handleTts(
  request,
  env
) {
  const deviceId =
    getDeviceId(request);

  let body;

  try {
    body =
      await request.json();
  } catch {
    return textError(
      "Pedido de voz inválido."
    );
  }

  const text =
    String(
      body.text || ""
    ).trim();

  const voice =
    String(
      body.voice || "Kore"
    ).trim();

  if (!text) {
    return textError(
      "Texto vazio."
    );
  }

  if (
    text.length >
    7000
  ) {
    return json(
      {
        error:
          "O texto para voz está muito longo."
      },
      413,
      deviceHeaders(
        deviceId
      )
    );
  }

  if (!env.GEMINI_API_KEY) {
    return json(
      {
        error:
          "GEMINI_API_KEY não está configurada no Cloudflare.",
        code:
          "GEMINI_NOT_CONFIGURED"
      },
      503,
      deviceHeaders(
        deviceId
      )
    );
  }

  const credit =
    await consumeCredits(
      env,
      deviceId,
      "tts",
      COSTS.tts
    );

  if (!credit.allowed) {
    return json(
      {
        error:
          "Os 100 créditos gratuitos deste mês foram usados.",
        code:
          "CREDITS_EXHAUSTED",
        remaining:
          credit.remaining
      },
      402,
      deviceHeaders(
        deviceId
      )
    );
  }

  try {
    const data =
      await geminiFetch(
        env,
        "interactions",
        {
          model:
            "gemini-3.1-flash-tts-preview",
          input:
            "Read the following text naturally " +
            "and clearly in the same language as the text. " +
            "Text begins:\n\n" +
            text,
          response_format: {
            type:
              "audio"
          },
          generation_config: {
            speech_config: [
              {
                voice:
                  voice
              }
            ]
          }
        }
      );

    const pcm =
      data &&
      data.output_audio &&
      data.output_audio.data;

    if (!pcm) {
      throw new Error(
        "O modelo de voz não devolveu áudio."
      );
    }

    const wav =
      pcmToWav(
        pcm
      );

    return new Response(
      wav,
      {
        status:
          200,
        headers:
          Object.assign(
            {},
            CORS_HEADERS,
            {
              "content-type":
                "audio/wav",
              "cache-control":
                "no-store"
            },
            deviceHeaders(
              deviceId
            )
          )
      }
    );
  } catch (error) {
    return json(
      {
        error:
          error &&
          error.message
            ? error.message
            : "A geração de voz falhou.",
        code:
          "TTS_ERROR"
      },
      error.status || 502,
      deviceHeaders(
        deviceId
      )
    );
  }
}

async function handleLiveToken(
  request,
  env
) {
  const deviceId =
    getDeviceId(request);

  if (!env.GEMINI_API_KEY) {
    return json(
      {
        error:
          "GEMINI_API_KEY não está configurada no Cloudflare.",
        code:
          "GEMINI_NOT_CONFIGURED"
      },
      503,
      deviceHeaders(
        deviceId
      )
    );
  }

  const credit =
    await consumeCredits(
      env,
      deviceId,
      "live_voice_start",
      COSTS.live
    );

  if (!credit.allowed) {
    return json(
      {
        error:
          "Os 100 créditos gratuitos deste mês foram usados.",
        code:
          "CREDITS_EXHAUSTED",
        remaining:
          credit.remaining
      },
      402,
      deviceHeaders(
        deviceId
      )
    );
  }

  if (!env.GEMINI_API_KEY) {
    return json(
      {
        error:
          "GEMINI_API_KEY não está configurada no Cloudflare."
      },
      500,
      deviceHeaders(
        deviceId
      )
    );
  }

  const now =
    Date.now();

  const expireTime =
    new Date(
      now +
      30 *
      60 *
      1000
    ).toISOString();

  const newSessionExpireTime =
    new Date(
      now +
      60 *
      1000
    ).toISOString();

  try {
    const response =
      await fetch(
        "https://generativelanguage.googleapis.com/" +
        "v1beta/auth_tokens",
        {
          method:
            "POST",
          headers: {
            "content-type":
              "application/json",
            "x-goog-api-key":
              env.GEMINI_API_KEY
          },
          body:
            JSON.stringify({
              uses:
                1,
              expireTime:
                expireTime,
              newSessionExpireTime:
                newSessionExpireTime,
              liveConnectConstraints: {
                model:
                  "models/gemini-3.8-live",
                config: {
                  sessionResumption: {},
                  responseModalities: [
                    "AUDIO"
                  ],
                  speechConfig: {
                    voiceConfig: {
                      prebuiltVoiceConfig: {
                        voiceName:
                          "Puck"
                      }
                    }
                  }
                }
              }
            })
        }
      );

    const data =
      await response.json();

    if (!response.ok) {
      return json(
        {
          error:
            data &&
            data.error &&
            data.error.message
              ? data.error.message
              : "Falha ao criar o token de voz ao vivo.",
          code:
            "LIVE_TOKEN_ERROR"
        },
        response.status,
        deviceHeaders(
          deviceId
        )
      );
    }

    return json(
      {
        ok:
          true,
        token:
          data.name ||
          (
            data.authToken &&
            data.authToken.name
          ) ||
          null,
        model:
          "gemini-3.8-live",
        remaining:
          credit.remaining
      },
      200,
      deviceHeaders(
        deviceId
      )
    );
  } catch (error) {
    return json(
      {
        error:
          error &&
          error.message
            ? error.message
            : "Falha no modo de voz ao vivo.",
        code:
          "LIVE_TOKEN_ERROR"
      },
      502,
      deviceHeaders(
        deviceId
      )
    );
  }
}

async function handleHistory(
  request,
  env
) {
  const deviceId =
    getDeviceId(request);

  if (!env.DB) {
    return json(
      {
        conversations: [],
        source:
          "local",
        persistent:
          false
      },
      200,
      deviceHeaders(
        deviceId
      )
    );
  }

  await ensureDb(env);

  const rows =
    await env.DB.prepare(
      "SELECT id, title, created_at, updated_at " +
      "FROM conversations " +
      "WHERE device_id = ? " +
      "ORDER BY updated_at DESC " +
      "LIMIT 50"
    ).bind(
      deviceId
    ).all();

  return json(
    {
      conversations:
        rows.results ||
        [],
      source:
        "d1",
      persistent:
        true
    },
    200,
    deviceHeaders(
      deviceId
    )
  );
}

async function handleHistoryMessages(
  request,
  env
) {
  const deviceId =
    getDeviceId(request);

  const url =
    new URL(request.url);

  const conversationId =
    String(
      url.searchParams.get(
        "conversationId"
      ) || ""
    ).slice(
      0,
      120
    );

  if (!conversationId) {
    return textError(
      "conversationId em falta."
    );
  }

  if (!env.DB) {
    return json(
      {
        messages: [],
        source:
          "local",
        persistent:
          false
      },
      200,
      deviceHeaders(
        deviceId
      )
    );
  }

  await ensureDb(env);

  const rows =
    await env.DB.prepare(
      "SELECT id, role, content, file_name, created_at " +
      "FROM messages " +
      "WHERE device_id = ? AND conversation_id = ? " +
      "ORDER BY id ASC"
    ).bind(
      deviceId,
      conversationId
    ).all();

  return json(
    {
      messages:
        rows.results ||
        [],
      source:
        "d1",
      persistent:
        true
    },
    200,
    deviceHeaders(
      deviceId
    )
  );
}

async function handleDeleteHistory(
  request,
  env
) {
  const deviceId =
    getDeviceId(request);

  if (!env.DB) {
    return json(
      {
        ok:
          true,
        source:
          "local",
        persistent:
          false
      },
      200,
      deviceHeaders(
        deviceId
      )
    );
  }

  await ensureDb(env);

  const url =
    new URL(request.url);

  const conversationId =
    String(
      url.searchParams.get(
        "conversationId"
      ) || ""
    ).slice(
      0,
      120
    );

  if (
    conversationId
  ) {
    await env.DB.batch([
      env.DB.prepare(
        "DELETE FROM messages " +
        "WHERE device_id = ? " +
        "AND conversation_id = ?"
      ).bind(
        deviceId,
        conversationId
      ),
      env.DB.prepare(
        "DELETE FROM conversations " +
        "WHERE device_id = ? " +
        "AND id = ?"
      ).bind(
        deviceId,
        conversationId
      )
    ]);
  } else {
    await env.DB.batch([
      env.DB.prepare(
        "DELETE FROM messages " +
        "WHERE device_id = ?"
      ).bind(
        deviceId
      ),
      env.DB.prepare(
        "DELETE FROM conversations " +
        "WHERE device_id = ?"
      ).bind(
        deviceId
      )
    ]);
  }

  return json(
    {
      ok:
        true,
      source:
        "d1",
      persistent:
        true
    },
    200,
    deviceHeaders(
      deviceId
    )
  );
}

async function handlePlans() {
  return json({
    currency:
      "USD",
    paymentsEnabled:
      false,
    subscriptionsEnabled:
      false,
    plans: [
      PLANS.free
    ]
  });
}

async function handleUsage(
  request,
  env
) {
  const deviceId =
    getDeviceId(request);

  try {
    const usage =
      await getUsage(
        env,
        deviceId
      );

    return json(
      usage,
      200,
      deviceHeaders(
        deviceId
      )
    );
  } catch (error) {
    return json(
      {
        error:
          error &&
          error.message
            ? error.message
            : "Não foi possível ler o uso."
      },
      500,
      deviceHeaders(
        deviceId
      )
    );
  }
}

async function route(
  request,
  env,
  ctx
) {
  const url =
    new URL(request.url);

  if (
    request.method ===
    "OPTIONS"
  ) {
    return new Response(
      null,
      {
        status:
          204,
        headers:
          CORS_HEADERS
      }
    );
  }

  if (
    url.pathname ===
      "/api/health" &&
    request.method ===
      "GET"
  ) {
    return json({
      ok:
        true,
      app:
        "Nexora AI",
      worker:
        true,
      database:
        Boolean(env.DB),
      geminiConfigured:
        Boolean(
          env.GEMINI_API_KEY
        ),
      imageGeneration:
        Boolean(
          env.GEMINI_API_KEY
        ),
      tts:
        Boolean(
          env.GEMINI_API_KEY
        ),
      liveVoice:
        Boolean(
          env.GEMINI_API_KEY
        ),
      payments:
        false,
      subscriptions:
        false
    });
  }

  if (
    url.pathname ===
      "/api/plans" &&
    request.method ===
      "GET"
  ) {
    return handlePlans();
  }

  if (
    url.pathname ===
      "/api/usage" &&
    request.method ===
      "GET"
  ) {
    return handleUsage(
      request,
      env
    );
  }

  if (
    url.pathname ===
      "/api/chat" &&
    request.method ===
      "POST"
  ) {
    return handleChat(
      request,
      env,
      ctx
    );
  }

  if (
    url.pathname ===
      "/api/image" &&
    request.method ===
      "POST"
  ) {
    return handleImage(
      request,
      env
    );
  }

  if (
    url.pathname ===
      "/api/tts" &&
    request.method ===
      "POST"
  ) {
    return handleTts(
      request,
      env
    );
  }

  if (
    url.pathname ===
      "/api/live-token" &&
    request.method ===
      "POST"
  ) {
    return handleLiveToken(
      request,
      env
    );
  }

  if (
    url.pathname ===
      "/api/history" &&
    request.method ===
      "GET"
  ) {
    return handleHistory(
      request,
      env
    );
  }

  if (
    url.pathname ===
      "/api/history/messages" &&
    request.method ===
      "GET"
  ) {
    return handleHistoryMessages(
      request,
      env
    );
  }

  if (
    url.pathname ===
      "/api/history" &&
    request.method ===
      "DELETE"
  ) {
    return handleDeleteHistory(
      request,
      env
    );
  }

  return env.ASSETS.fetch(
    request
  );
}

export default {
  async fetch(
    request,
    env,
    ctx
  ) {
    try {
      return await route(
        request,
        env,
        ctx
      );
    } catch (error) {
      return json(
        {
          error:
            error &&
            error.message
              ? error.message
              : "Erro interno do Nexora AI.",
          code:
            "INTERNAL_ERROR"
        },
        500
      );
    }
  }
};
