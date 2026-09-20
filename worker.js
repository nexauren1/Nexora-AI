
const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type, x-nexora-device"
};

const MODE_PROMPTS = {
  chat: "You are Nexora AI, a helpful, clear and accurate general assistant. Answer in the user's language.",
  work: "Act as a professional writing and work assistant. Help draft, rewrite, plan, organize and produce polished useful outputs. Answer in the user's language.",
  summary: "Summarize the provided material clearly. Extract key ideas, important facts, action points and study notes when useful. Answer in the user's language.",
  pdf: "Analyze the provided PDF. Explain its content, answer questions about it, extract key sections and make study notes. Answer in the user's language.",
  documents: "Analyze the provided document. Extract meaning, structure, important details, tables or sections when possible. Answer in the user's language.",
  image: "Analyze the provided image carefully. Describe visible content, read legible text and explain charts or diagrams. Do not invent details.",
  audio: "Analyze the provided audio. Transcribe, summarize and identify useful details when possible. Do not invent audio content.",
  video: "Analyze the provided video. Summarize scenes and visible or audible information. Stay within available context and file limits.",
  code: "Act as a careful software engineering assistant. Give working code, explain important decisions, debug errors and prefer secure maintainable solutions.",
  qa: "Answer the user's question directly and accurately. Explain when useful and state uncertainty when needed."
};

const PLANS = {
  free: {
    id: "free",
    name: "Free",
    price: 0,
    monthlyCredits: 100,
    description: "100 créditos por mês"
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 5,
    monthlyCredits: 1000,
    description: "1000 créditos por mês"
  }
};

let schemaPromise;

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({}, JSON_HEADERS, CORS_HEADERS, extra)
  });
}

function getDeviceId(request) {
  const header = request.headers.get("x-nexora-device");
  if (header && /^[a-zA-Z0-9_-]{12,100}$/.test(header)) return header;

  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)nexora_device=([^;]+)/);
  if (match && /^[a-zA-Z0-9_-]{12,100}$/.test(match[1])) {
    return match[1];
  }

  return crypto.randomUUID().replaceAll("-", "");
}

function deviceHeaders(deviceId) {
  return {
    "set-cookie":
      "nexora_device=" + deviceId +
      "; Path=/; Max-Age=31536000; SameSite=Lax; Secure"
  };
}


async function ensureDb(env) {
  if (!env.DB) return;

  if (!schemaPromise) {
    schemaPromise = env.DB.batch([
      env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS plans (" +
        "id TEXT PRIMARY KEY, name TEXT NOT NULL," +
        "price_usd INTEGER NOT NULL DEFAULT 0," +
        "billing_interval TEXT NOT NULL DEFAULT 'month'," +
        "monthly_credits INTEGER NOT NULL DEFAULT 0," +
        "active INTEGER NOT NULL DEFAULT 1," +
        "created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"
      ),
      env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS anonymous_state (" +
        "device_id TEXT PRIMARY KEY," +
        "plan_id TEXT NOT NULL DEFAULT 'free'," +
        "monthly_credits_balance INTEGER NOT NULL DEFAULT 100," +
        "used_this_period INTEGER NOT NULL DEFAULT 0," +
        "period_start TEXT, period_end TEXT," +
        "created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"
      ),
      env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS account_state (" +
        "firebase_uid TEXT PRIMARY KEY," +
        "plan_id TEXT NOT NULL DEFAULT 'free'," +
        "subscription_status TEXT NOT NULL DEFAULT 'NONE'," +
        "monthly_credits_balance INTEGER NOT NULL DEFAULT 100," +
        "purchased_credits_balance INTEGER NOT NULL DEFAULT 0," +
        "used_this_period INTEGER NOT NULL DEFAULT 0," +
        "period_start TEXT, period_end TEXT, grace_until TEXT," +
        "created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"
      ),
      env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS activities (" +
        "id INTEGER PRIMARY KEY AUTOINCREMENT," +
        "firebase_uid TEXT, device_id TEXT," +
        "feature TEXT NOT NULL, action TEXT NOT NULL," +
        "credits_used INTEGER NOT NULL DEFAULT 0," +
        "status TEXT NOT NULL DEFAULT 'success'," +
        "request_id TEXT, metadata TEXT, created_at TEXT NOT NULL)"
      ),
      env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS credit_ledger (" +
        "id INTEGER PRIMARY KEY AUTOINCREMENT," +
        "firebase_uid TEXT, device_id TEXT," +
        "bucket TEXT NOT NULL, entry_type TEXT NOT NULL," +
        "amount INTEGER NOT NULL, source TEXT NOT NULL," +
        "reference_id TEXT, expires_at TEXT, created_at TEXT NOT NULL)"
      ),
      env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS subscriptions (" +
        "id INTEGER PRIMARY KEY AUTOINCREMENT," +
        "firebase_uid TEXT, device_id TEXT," +
        "provider TEXT NOT NULL," +
        "provider_subscription_id TEXT," +
        "plan_id TEXT NOT NULL, status TEXT NOT NULL," +
        "current_period_start TEXT, current_period_end TEXT," +
        "next_billing_at TEXT," +
        "cancel_at_period_end INTEGER NOT NULL DEFAULT 0," +
        "canceled_at TEXT, created_at TEXT NOT NULL," +
        "updated_at TEXT NOT NULL)"
      ),
      env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS payments (" +
        "id INTEGER PRIMARY KEY AUTOINCREMENT," +
        "firebase_uid TEXT, device_id TEXT," +
        "provider TEXT NOT NULL," +
        "provider_payment_id TEXT, provider_order_id TEXT," +
        "capture_id TEXT, subscription_id INTEGER," +
        "amount_usd INTEGER NOT NULL DEFAULT 0," +
        "currency TEXT NOT NULL DEFAULT 'USD'," +
        "status TEXT NOT NULL, paid_at TEXT," +
        "created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"
      ),
      env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS webhook_events (" +
        "id INTEGER PRIMARY KEY AUTOINCREMENT," +
        "provider TEXT NOT NULL, event_id TEXT NOT NULL," +
        "event_type TEXT NOT NULL," +
        "status TEXT NOT NULL DEFAULT 'received'," +
        "processed_at TEXT, created_at TEXT NOT NULL," +
        "UNIQUE(provider, event_id))"
      ),
      env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS credit_products (" +
        "id TEXT PRIMARY KEY, name TEXT NOT NULL," +
        "credits INTEGER NOT NULL, price_usd INTEGER NOT NULL," +
        "active INTEGER NOT NULL DEFAULT 1," +
        "created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"
      ),
      env.DB.prepare(
        "INSERT INTO plans " +
        "(id, name, price_usd, billing_interval, monthly_credits, active, created_at, updated_at) " +
        "VALUES " +
        "('free','Free',0,'month',100,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)," +
        "('pro','Pro',5,'month',1000,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) " +
        "ON CONFLICT(id) DO UPDATE SET " +
        "name=excluded.name, price_usd=excluded.price_usd, " +
        "monthly_credits=excluded.monthly_credits, active=excluded.active, " +
        "updated_at=excluded.updated_at"
      )
    ]).catch(function(error) {
      schemaPromise = null;
      throw error;
    });
  }

  return schemaPromise;
}

function getFirebaseUid(request) {
  const value =
    request.headers.get("x-firebase-uid") || "";

  return /^[A-Za-z0-9:_-]{1,255}$/.test(value)
    ? value
    : "";
}

async function getPlan(env, deviceId) {
  if (!env.DB) return PLANS.free;

  await ensureDb(env);

  const row = await env.DB
    .prepare(
      "SELECT plan_id AS plan FROM anonymous_state " +
      "WHERE device_id = ?"
    )
    .bind(deviceId)
    .first();

  return PLANS[row && row.plan] || PLANS.free;
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
      used: null,
      remaining: null
    };
  }

  await ensureDb(env);

  const now = new Date();
  const nowIso = now.toISOString();
  const monthStart =
    nowIso.slice(0, 7) + "-01T00:00:00.000Z";

  const nextMonth = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth() + 1,
      1
    )
  ).toISOString();

  let plan = await getPlan(
    env,
    deviceId
  );

  await env.DB.prepare(
    "INSERT INTO anonymous_state " +
    "(device_id, plan_id, monthly_credits_balance, " +
    "used_this_period, period_start, period_end, " +
    "created_at, updated_at) " +
    "VALUES (?, 'free', 100, 0, ?, ?, ?, ?) " +
    "ON CONFLICT(device_id) DO NOTHING"
  ).bind(
    deviceId,
    monthStart,
    nextMonth,
    nowIso,
    nowIso
  ).run();

  const state = await env.DB
    .prepare(
      "SELECT plan_id, monthly_credits_balance, " +
      "used_this_period, period_end " +
      "FROM anonymous_state WHERE device_id = ?"
    )
    .bind(deviceId)
    .first();

  plan =
    PLANS[state && state.plan_id] ||
    PLANS.free;

  let monthlyBalance =
    Number(
      (state && state.monthly_credits_balance) || 0
    );

  const periodEnd =
    state && state.period_end
      ? new Date(state.period_end)
      : null;

  if (!periodEnd || periodEnd <= now) {
    monthlyBalance =
      plan.monthlyCredits;

    await env.DB.prepare(
      "UPDATE anonymous_state SET " +
      "monthly_credits_balance = ?, " +
      "used_this_period = 0, period_start = ?, " +
      "period_end = ?, updated_at = ? " +
      "WHERE device_id = ?"
    ).bind(
      monthlyBalance,
      monthStart,
      nextMonth,
      nowIso,
      deviceId
    ).run();
  }

  if (monthlyBalance < cost) {
    return {
      allowed: false,
      plan: plan,
      used: plan.monthlyCredits - monthlyBalance,
      remaining: Math.max(0, monthlyBalance)
    };
  }

  const remaining =
    monthlyBalance - cost;

  await env.DB.batch([
    env.DB.prepare(
      "UPDATE anonymous_state SET " +
      "monthly_credits_balance = ?, " +
      "used_this_period = used_this_period + ?, " +
      "updated_at = ? WHERE device_id = ?"
    ).bind(
      remaining,
      cost,
      nowIso,
      deviceId
    ),
    env.DB.prepare(
      "INSERT INTO activities " +
      "(device_id, feature, action, credits_used, " +
      "status, created_at) VALUES (?, ?, 'use', ?, 'success', ?)"
    ).bind(
      deviceId,
      feature,
      cost,
      nowIso
    ),
    env.DB.prepare(
      "INSERT INTO credit_ledger " +
      "(device_id, bucket, entry_type, amount, source, created_at) " +
      "VALUES (?, 'monthly', 'usage', ?, ?, ?)"
    ).bind(
      deviceId,
      -cost,
      feature,
      nowIso
    )
  ]);

  return {
    allowed: true,
    plan: plan,
    used: plan.monthlyCredits - remaining,
    remaining: remaining
  };
}

async function saveConversation(
  env,
  deviceId,
  conversationId,
  title,
  role,
  content
) {
  if (!env.DB) return;

  await ensureDb(env);

  await env.DB.prepare(
    "INSERT INTO activities " +
    "(device_id, feature, action, credits_used, " +
    "status, metadata, created_at) " +
    "VALUES (?, 'chat', ?, 0, 'success', ?, ?)"
  ).bind(
    deviceId,
    role === "assistant"
      ? "assistant_response"
      : "user_message",
    JSON.stringify({
      conversationId: conversationId || null,
      title: title || "Nova conversa",
      hasContent: Boolean(content)
    }),
    new Date().toISOString()
  ).run();
}


async function geminiFetch(env, path, body) {
  if (!env.GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY não está configurada no Cloudflare."
    );
  }

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/" + path,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY
      },
      body: JSON.stringify(body)
    }
  );

  const raw = await response.text();
  let data;

  try {
    data = JSON.parse(raw);
  } catch {
    data = {
      error: {
        message: raw
      }
    };
  }

  if (!response.ok) {
    const message =
      (data.error && data.error.message) ||
      "Gemini error " + response.status;

    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return data;
}

function collectText(data) {
  const parts =
    (data &&
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts) || [];

  return parts
    .map(function(part) {
      return part && part.text ? part.text : "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function collectImage(data) {
  const parts =
    (data &&
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts) || [];

  for (const part of parts) {
    const inline = part && (part.inlineData || part.inline_data);
    if (inline && inline.data) {
      return {
        mimeType:
          inline.mimeType ||
          inline.mime_type ||
          "image/png",
        data: inline.data
      };
    }
  }

  return null;
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;

  for (
    let index = 0;
    index < bytes.length;
    index += chunk
  ) {
    binary += String.fromCharCode(
      ...bytes.subarray(
        index,
        Math.min(index + chunk, bytes.length)
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
  const binary = atob(pcmBase64);
  const pcm = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    pcm[i] = binary.charCodeAt(i);
  }

  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const blockAlign = channels * 2;
  const byteRate = sampleRate * blockAlign;

  function writeText(offset, text) {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(
        offset + i,
        text.charCodeAt(i)
      );
    }
  }

  writeText(0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, pcm.length, true);

  const output = new Uint8Array(
    44 + pcm.length
  );

  output.set(
    new Uint8Array(header),
    0
  );

  output.set(pcm, 44);

  return output;
}

function buildSystem(mode) {
  return (
    MODE_PROMPTS[mode] ||
    MODE_PROMPTS.chat
  ) +
    "\nNever claim to have used a tool or source you did not use." +
    "\nDo not invent facts, file contents or media details.";
}

async function handleChat(request, env, ctx) {
  const deviceId = getDeviceId(request);
  const firebaseUid = getFirebaseUid(request);
  const contentType =
    request.headers.get("content-type") || "";

  let body;
  let file = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const historyRaw = form.get("history");

    body = {
      message: String(form.get("message") || ""),
      mode: String(form.get("mode") || "chat"),
      conversationId:
        String(form.get("conversationId") || ""),
      title: String(
        form.get("title") || "Nova conversa"
      ),
      history: historyRaw
        ? JSON.parse(String(historyRaw))
        : []
    };

    const candidate = form.get("file");
    if (
      candidate &&
      typeof candidate.arrayBuffer === "function"
    ) {
      file = candidate;
    }
  } else {
    body = await request.json();
  }

  const message = String(
    body.message || ""
  ).trim();

  const mode = String(
    body.mode || "chat"
  );

  const history = Array.isArray(body.history)
    ? body.history
    : [];

  if (!message && !file) {
    return json(
      {
        error:
          "Escreve uma mensagem ou envia um ficheiro."
      },
      400
    );
  }

  const cost =
    mode === "video"
      ? 4
      : file
      ? 2
      : 1;

  const credit = await consumeCredits(
    env,
    deviceId,
    file ? "analyze_" + mode : "chat",
    cost
  );

  if (!credit.allowed) {
    return json(
      {
        error:
          "Limite mensal atingido no plano " +
          credit.plan.name +
          ". Faça upgrade para o Pro.",
        code: "CREDITS_EXHAUSTED",
        plan: credit.plan,
        remaining: credit.remaining
      },
      402,
      deviceHeaders(deviceId)
    );
  }

  const contents = [];

  for (const item of history.slice(-10)) {
    if (!item || !item.content) continue;

    contents.push({
      role:
        item.role === "assistant"
          ? "model"
          : "user",
      parts: [
        {
          text: String(
            item.content
          ).slice(0, 12000)
        }
      ]
    });
  }

  const parts = [];

  if (message) {
    parts.push({
      text: message
    });
  }

  if (file) {
    const maxBytes =
      15 * 1024 * 1024;

    if (file.size > maxBytes) {
      return json(
        {
          error:
            "Este MVP aceita ficheiros até 15 MB por pedido."
        },
        413,
        deviceHeaders(deviceId)
      );
    }

    const bytes = new Uint8Array(
      await file.arrayBuffer()
    );

    parts.push({
      inlineData: {
        mimeType:
          file.type ||
          "application/octet-stream",
        data: bytesToBase64(bytes)
      }
    });
  }

  contents.push({
    role: "user",
    parts: parts
  });

  try {
    const data = await geminiFetch(
      env,
      "models/gemini-3.8-flash:generateContent",
      {
        systemInstruction: {
          parts: [
            {
              text: buildSystem(mode)
            }
          ]
        },
        contents: contents,
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 4096
        }
      }
    );

    const answer =
      collectText(data) ||
      "Não consegui produzir uma resposta útil.";

    const title =
      body.title ||
      (
        message
          ? message.slice(0, 70)
          : "Análise de " +
            (file && file.name
              ? file.name
              : "ficheiro")
      );

    ctx.waitUntil(
      saveConversation(
        env,
        deviceId,
        String(body.conversationId || ""),
        title,
        "user",
        message
      )
        .then(function() {
          return saveConversation(
            env,
            deviceId,
            String(body.conversationId || ""),
            title,
            "assistant",
            answer
          );
        })
        .catch(function() {})
    );

    return json(
      {
        ok: true,
        answer: answer,
        plan: credit.plan,
        remaining: credit.remaining,
        conversationId:
          String(body.conversationId || "")
      },
      200,
      deviceHeaders(deviceId)
    );
  } catch (error) {
    return json(
      {
        error:
          error.message ||
          "Falha ao contactar o Gemini.",
        code: "GEMINI_ERROR"
      },
      error.status || 502,
      deviceHeaders(deviceId)
    );
  }
}

async function handleImage(request, env) {
  const deviceId = getDeviceId(request);
  const firebaseUid = getFirebaseUid(request);
  const contentType =
    request.headers.get("content-type") || "";

  let prompt = "";
  let file = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    prompt = String(
      form.get("prompt") || ""
    ).trim();

    const candidate = form.get("file");
    if (
      candidate &&
      typeof candidate.arrayBuffer === "function"
    ) {
      file = candidate;
    }
  } else {
    const body = await request.json();
    prompt = String(
      body.prompt || ""
    ).trim();
  }

  if (!prompt) {
    return json(
      {
        error:
          "Escreve o que queres gerar."
      },
      400
    );
  }

  const credit = await consumeCredits(
    env,
    deviceId,
    "image_generation",
    10
  );

  if (!credit.allowed) {
    return json(
      {
        error:
          "Os créditos do plano atual foram atingidos.",
        code: "CREDITS_EXHAUSTED",
        plan: credit.plan,
        remaining: credit.remaining
      },
      402,
      deviceHeaders(deviceId)
    );
  }

  const parts = [
    {
      text: prompt
    }
  ];

  if (file) {
    if (file.size > 10 * 1024 * 1024) {
      return json(
        {
          error:
            "A imagem de referência deve ter até 10 MB."
        },
        413,
        deviceHeaders(deviceId)
      );
    }

    const bytes = new Uint8Array(
      await file.arrayBuffer()
    );

    parts.push({
      inlineData: {
        mimeType:
          file.type || "image/jpeg",
        data: bytesToBase64(bytes)
      }
    });
  }

  try {
    const data = await geminiFetch(
      env,
      "models/gemini-3.1-flash-image:generateContent",
      {
        contents: [
          {
            role: "user",
            parts: parts
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

    const image = collectImage(data);
    const text = collectText(data);

    if (!image) {
      return json(
        {
          error:
            "O modelo de imagem não devolveu uma imagem. O acesso ao modelo pode exigir billing.",
          details: text
        },
        502,
        deviceHeaders(deviceId)
      );
    }

    return json(
      {
        ok: true,
        image:
          "data:" +
          image.mimeType +
          ";base64," +
          image.data,
        answer: text,
        model:
          "gemini-3.1-flash-image",
        plan: credit.plan,
        remaining: credit.remaining
      },
      200,
      deviceHeaders(deviceId)
    );
  } catch (error) {
    return json(
      {
        error:
          error.message ||
          "A geração de imagem falhou.",
        code:
          "IMAGE_GENERATION_ERROR",
        hint:
          "A geração de imagens do Nano Banana pode exigir billing no Google."
      },
      error.status || 502,
      deviceHeaders(deviceId)
    );
  }
}

async function handleTts(request, env) {
  const deviceId = getDeviceId(request);
  const firebaseUid = getFirebaseUid(request);
  const body = await request.json();
  const text = String(
    body.text || ""
  ).trim();

  const voice = String(
    body.voice || "Kore"
  );

  if (!text) {
    return json(
      {
        error: "Texto vazio."
      },
      400
    );
  }

  if (text.length > 7000) {
    return json(
      {
        error:
          "O texto para voz está muito longo."
      },
      413
    );
  }

  const credit = await consumeCredits(
    env,
    deviceId,
    "tts",
    5
  );

  if (!credit.allowed) {
    return json(
      {
        error:
          "Os créditos do plano atual foram atingidos.",
        code: "CREDITS_EXHAUSTED",
        remaining:
          credit.remaining
      },
      402,
      deviceHeaders(deviceId)
    );
  }

  try {
    const response = await geminiFetch(
      env,
      "interactions",
      {
        model:
          "gemini-3.1-flash-tts-preview",
        input:
          "Read the following text naturally and clearly in the same language as the text. Text begins:\n\n" +
          text,
        response_format: {
          type: "audio"
        },
        generation_config: {
          speech_config: [
            {
              voice: voice
            }
          ]
        }
      }
    );

    const pcm =
      response &&
      response.output_audio &&
      response.output_audio.data;

    if (!pcm) {
      throw new Error(
        "O modelo TTS não devolveu áudio."
      );
    }

    const wav = pcmToWav(pcm);

    return new Response(wav, {
      status: 200,
      headers: Object.assign(
        {},
        CORS_HEADERS,
        {
          "content-type":
            "audio/wav",
          "cache-control":
            "no-store"
        },
        deviceHeaders(deviceId)
      )
    });
  } catch (error) {
    return json(
      {
        error:
          error.message ||
          "A geração de voz falhou.",
        code: "TTS_ERROR",
        hint:
          "O TTS do Gemini está em pré-lançamento e pode exigir acesso ou billing."
      },
      error.status || 502,
      deviceHeaders(deviceId)
    );
  }
}

async function handleLiveToken(request, env) {
  const deviceId = getDeviceId(request);
  const firebaseUid = getFirebaseUid(request);
  const credit = await consumeCredits(
    env,
    deviceId,
    "live_voice_start",
    1
  );

  if (!credit.allowed) {
    return json(
      {
        error:
          "Os créditos do plano atual foram atingidos.",
        code: "CREDITS_EXHAUSTED",
        remaining:
          credit.remaining
      },
      402,
      deviceHeaders(deviceId)
    );
  }

  if (!env.GEMINI_API_KEY) {
    return json(
      {
        error:
          "GEMINI_API_KEY não está configurada."
      },
      500,
      deviceHeaders(deviceId)
    );
  }

  const expireTime = new Date(
    Date.now() + 25 * 60 * 1000
  ).toISOString();

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/auth_tokens",
      {
        method: "POST",
        headers: {
          "content-type":
            "application/json",
          "x-goog-api-key":
            env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          uses: 1,
          expireTime: expireTime,
          liveConnectConstraints: {
            model:
              "models/gemini-3.8-live",
            config: {
              responseModalities: [
                "AUDIO"
              ],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: "Puck"
                  }
                }
              },
              systemInstruction: {
                parts: [
                  {
                    text:
                      "You are Nexora AI. Be helpful, natural, concise and speak in the user's language."
                  }
                ]
              }
            }
          }
        })
      }
    );

    const raw =
      await response.text();

    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      data = {
        error: {
          message: raw
        }
      };
    }

    if (!response.ok) {
      return json(
        {
          error:
            data.error &&
            data.error.message
              ? data.error.message
              : "Falha ao criar o token de voz ao vivo.",
          code:
            "LIVE_TOKEN_ERROR"
        },
        response.status,
        deviceHeaders(deviceId)
      );
    }

    return json(
      {
        ok: true,
        token: data.name || (data.authToken && data.authToken.name),
        model:
          "gemini-3.8-live",
        remaining:
          credit.remaining
      },
      200,
      deviceHeaders(deviceId)
    );
  } catch (error) {
    return json(
      {
        error:
          error.message ||
          "Falha no modo de voz ao vivo."
      },
      502,
      deviceHeaders(deviceId)
    );
  }
}

async function handlePlans() {
  return json({
    currency: "USD",
    sandbox: true,
    plans: Object.values(PLANS)
  });
}

async function paypalAccessToken(env) {
  if (
    !env.PAYPAL_CLIENT_ID ||
    !env.PAYPAL_CLIENT_SECRET
  ) {
    throw new Error(
      "Credenciais PayPal não configuradas."
    );
  }

  const base =
    env.PAYPAL_BASE_URL ||
    "https://api-m.sandbox.paypal.com";

  const auth = btoa(
    env.PAYPAL_CLIENT_ID +
    ":" +
    env.PAYPAL_CLIENT_SECRET
  );

  const response = await fetch(
    base +
    "/v1/oauth2/token",
    {
      method: "POST",
      headers: {
        authorization:
          "Basic " + auth,
        "content-type":
          "application/x-www-form-urlencoded"
      },
      body:
        "grant_type=client_credentials"
    }
  );

  if (!response.ok) {
    throw new Error(
      "PayPal OAuth falhou."
    );
  }

  const data =
    await response.json();

  return {
    token: data.access_token,
    base: base
  };
}

async function handlePayPalCreateSubscription(
  request,
  env
) {
  const deviceId =
    getDeviceId(request);

  const configuredPlanId =
    env.PAYPAL_PRO_PLAN_ID;

  if (!configuredPlanId) {
    return json(
      {
        error:
          "PAYPAL_PRO_PLAN_ID ainda não está configurado. Cria/ativa o plano Pro no PayPal Sandbox e adiciona esse ID como Secret/Variable.",
        code:
          "PAYPAL_PLAN_MISSING"
      },
      503,
      deviceHeaders(deviceId)
    );
  }

  const returnUrl =
    new URL(request.url);

  returnUrl.pathname = "/";
  returnUrl.searchParams.set(
    "paypal",
    "success"
  );

  const cancelUrl =
    new URL(request.url);

  cancelUrl.pathname = "/";
  cancelUrl.searchParams.set(
    "paypal",
    "cancel"
  );

  try {
    const auth =
      await paypalAccessToken(env);

    const response =
      await fetch(
        auth.base +
        "/v1/billing/subscriptions",
        {
          method: "POST",
          headers: {
            authorization:
              "Bearer " +
              auth.token,
            "content-type":
              "application/json",
            "PayPal-Request-Id":
              crypto.randomUUID()
          },
          body: JSON.stringify({
            plan_id:
              configuredPlanId,
            application_context: {
              brand_name:
                "Nexora AI",
              locale:
                "pt-PT",
              user_action:
                "SUBSCRIBE_NOW",
              return_url:
                returnUrl.toString(),
              cancel_url:
                cancelUrl.toString()
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
            data.message ||
            "PayPal não conseguiu criar a subscrição.",
          details:
            data
        },
        response.status,
        deviceHeaders(deviceId)
      );
    }

    if (env.DB) {
      await ensureDb(env);

      await env.DB.prepare(
        "INSERT INTO subscriptions " +
        "(device_id, provider, provider_id, plan, status, created_at, updated_at) " +
        "VALUES (?, 'paypal', ?, 'pro', ?, ?, ?)"
      ).bind(
        deviceId,
        firebaseUid || null,
        data.id || null,
        data.status || "APPROVAL_PENDING",
        new Date().toISOString(),
        new Date().toISOString()
      ).run();
    }

    const approve =
      (data.links || []).find(
        function(link) {
          return link.rel === "approve";
        }
      );

    return json(
      {
        ok: true,
        id: data.id,
        status:
          data.status,
        approveUrl:
          approve
            ? approve.href
            : null
      },
      200,
      deviceHeaders(deviceId)
    );
  } catch (error) {
    return json(
      {
        error:
          error.message ||
          "Falha PayPal."
      },
      502,
      deviceHeaders(deviceId)
    );
  }
}

async function handlePayPalStatus(
  request,
  env
) {
  const deviceId =
    getDeviceId(request);

  const body =
    await request.json();

  const subscriptionId =
    String(
      body.subscriptionId ||
      ""
    );

  if (!subscriptionId) {
    return json(
      {
        error:
          "subscriptionId em falta."
      },
      400
    );
  }

  try {
    const auth =
      await paypalAccessToken(env);

    const response =
      await fetch(
        auth.base +
        "/v1/billing/subscriptions/" +
        encodeURIComponent(
          subscriptionId
        ),
        {
          headers: {
            authorization:
              "Bearer " +
              auth.token,
            "content-type":
              "application/json"
          }
        }
      );

    const data =
      await response.json();

    if (!response.ok) {
      return json(
        {
          error:
            data.message ||
            "Não foi possível verificar a subscrição."
        },
        response.status,
        deviceHeaders(deviceId)
      );
    }

    const status =
      String(
        data.status ||
        "UNKNOWN"
      );

    const plan =
      status === "ACTIVE"
        ? "pro"
        : "free";

    if (env.DB) {
      await ensureDb(env);

      await env.DB.prepare(
        "INSERT INTO devices " +
        "(id, plan, created_at, updated_at) " +
        "VALUES (?, ?, ?, ?) " +
        "ON CONFLICT(id) DO UPDATE SET " +
        "plan = excluded.plan, updated_at = excluded.updated_at"
      ).bind(
        deviceId,
        plan,
        plan === "pro" ? 1000 : 100,
        new Date().toISOString(),
        new Date().toISOString()
      ).run();

      await env.DB.prepare(
        "UPDATE subscriptions " +
        "SET plan_id = ?, status = ?, updated_at = ? " +
        "WHERE provider_subscription_id = ? AND device_id = ?"
      ).bind(
        plan,
        status,
        new Date().toISOString(),
        subscriptionId,
        deviceId
      ).run();
    }

    return json(
      {
        ok: true,
        status: status,
        plan: plan
      },
      200,
      deviceHeaders(deviceId)
    );
  } catch (error) {
    return json(
      {
        error:
          error.message ||
          "Falha ao verificar PayPal."
      },
      502,
      deviceHeaders(deviceId)
    );
  }
}

async function handleHistory(
  request,
  env
) {
  const deviceId = getDeviceId(request);

  return json(
    {
      conversations: [],
      source: "local"
    },
    200,
    deviceHeaders(deviceId)
  );
}

async function handleHistoryMessages(
  request,
  env
) {
  const deviceId = getDeviceId(request);

  return json(
    {
      messages: [],
      source: "local"
    },
    200,
    deviceHeaders(deviceId)
  );
}

async function route(
  request,
  env,
  ctx
) {
  const url =
    new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(
      null,
      {
        status: 204,
        headers:
          CORS_HEADERS
      }
    );
  }

  if (
    url.pathname === "/api/health" &&
    request.method === "GET"
  ) {
    return json(
      {
        ok: true,
        app: "Nexora AI",
        worker: true,
        geminiConfigured:
          Boolean(
            env.GEMINI_API_KEY
          ),
        paypalSandbox:
          (
            env.PAYPAL_BASE_URL ||
            ""
          ).includes(
            "sandbox"
          )
      }
    );
  }

  if (
    url.pathname === "/api/plans" &&
    request.method === "GET"
  ) {
    return handlePlans();
  }

  if (
    url.pathname === "/api/chat" &&
    request.method === "POST"
  ) {
    return handleChat(
      request,
      env,
      ctx
    );
  }

  if (
    url.pathname === "/api/image" &&
    request.method === "POST"
  ) {
    return handleImage(
      request,
      env
    );
  }

  if (
    url.pathname === "/api/tts" &&
    request.method === "POST"
  ) {
    return handleTts(
      request,
      env
    );
  }

  if (
    url.pathname === "/api/live-token" &&
    request.method === "POST"
  ) {
    return handleLiveToken(
      request,
      env
    );
  }

  if (
    url.pathname ===
      "/api/paypal/create-subscription" &&
    request.method === "POST"
  ) {
    return handlePayPalCreateSubscription(
      request,
      env
    );
  }

  if (
    url.pathname ===
      "/api/paypal/status" &&
    request.method === "POST"
  ) {
    return handlePayPalStatus(
      request,
      env
    );
  }

  if (
    url.pathname === "/api/history" &&
    request.method === "GET"
  ) {
    return handleHistory(
      request,
      env
    );
  }

  if (
    url.pathname ===
      "/api/history/messages" &&
    request.method === "GET"
  ) {
    return handleHistoryMessages(
      request,
      env
    );
  }

  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env, ctx) {
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
            error && error.message
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
