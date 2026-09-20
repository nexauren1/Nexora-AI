
# Nexora AI

Nexora AI is a lightweight multimodal AI workspace powered by
Cloudflare Workers and Google Gemini.

## Current phase

This repository is intentionally focused on a stable anonymous MVP.

Included:
- Chat
- Writing and school/work assistance
- Summaries
- PDF analysis
- Text-file analysis
- Image, audio and video analysis
- Code assistance
- Image generation
- Gemini TTS
- Gemini Live voice
- Local history
- D1 history and monthly quota when the DB binding exists
- Free quota: 100 credits/month

Not included yet:
- Firebase Authentication
- Google Sign-In
- Paid subscriptions
- PayPal
- Purchased credit packs

Those are planned for the next phase after the core app is stable.

## Cloudflare variables

Keep this secret out of GitHub:

- GEMINI_API_KEY

The frontend never contains the Gemini API key.

## D1

The Worker expects a D1 binding named DB.
The Wrangler file intentionally does not hard-code the database UUID.

If the existing Cloudflare project already has a DB binding,
keep that binding when deploying. The Worker initializes the MVP
tables automatically on first database request.

schema.sql contains the same schema for manual migrations.

## API

- GET /api/health
- GET /api/plans
- GET /api/usage
- POST /api/chat
- POST /api/image
- POST /api/tts
- POST /api/live-token
- GET /api/history
- GET /api/history/messages?conversationId=...
- DELETE /api/history
