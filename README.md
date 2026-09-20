# Nexora AI

Nexora AI is a lightweight multimodal AI workspace powered by Cloudflare Workers and Google Gemini.

## Included

- Chat
- Trabalhos e escrita
- Resumos
- PDF e documentos
- Análise de imagens, áudio e vídeo
- Código e perguntas/respostas
- Geração de imagens com Nano Banana
- Geração de voz com Gemini TTS
- Voz em tempo real com Gemini Live
- Histórico local e histórico D1 quando a binding DB estiver disponível
- Free: 100 créditos/mês
- Pro: 1000 créditos/mês, US$5/mês
- PayPal Sandbox subscription flow

## Cloudflare secrets/variables

Keep these out of GitHub:

- GEMINI_API_KEY
- PAYPAL_CLIENT_ID
- PAYPAL_CLIENT_SECRET
- PAYPAL_PRO_PLAN_ID
- PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com

The Worker uses env.GEMINI_API_KEY, so the Gemini key is never bundled into the frontend.

## D1

The app expects a D1 binding named DB. The Worker also creates its tables lazily on first use, and schema.sql is included for manual migrations.

## Deploy

Cloudflare Workers + Static Assets can deploy both the Worker and the frontend from this repository.

The Wrangler file intentionally does not hard-code the D1 database UUID because the existing Cloudflare project already owns that binding. If the dashboard binding is not preserved by the deployment setup, add the existing database UUID to wrangler.json.

## Current API

- GET /api/health
- GET /api/plans
- POST /api/chat
- POST /api/image
- POST /api/tts
- POST /api/live-token
- POST /api/paypal/create-subscription
- POST /api/paypal/status
- GET /api/history
- GET /api/history/messages
