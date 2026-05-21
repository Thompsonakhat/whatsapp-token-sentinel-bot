# CookMyBots WhatsApp Bot (Managed WhatsApp)

This repo runs the WhatsApp Token Sentinel bot brain for CookMyBots managed WhatsApp transport.

## Important

CookMyBots owns the WhatsApp connection and forwards inbound WhatsApp messages to this service.

Do not add WhatsApp Cloud API tokens here.
No WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN, or WhatsApp Cloud API webhook setup is required.

## What it does

Users can paste EVM contract addresses in WhatsApp DMs or groups. The bot fetches token and market enrichment, keeps MongoDB-backed watchlists, and uses ChainGPT through the CookMyBots AI Gateway as the primary provider for contract-address risk analysis.

Reports include token identity when available, chain or network, overall risk level, important warnings, notable positives, a short recommendation, and fallback data checks.

## Endpoint

POST /webhook/cookmybots/whatsapp

Header:
X-CookMyBots-Webhook-Secret: your deployed secret

Body:
{
  "from": "2348012345678@s.whatsapp.net",
  "text": "analyze base 0x0000000000000000000000000000000000000000",
  "messageId": "message-id"
}

Response:
{
  "ok": true,
  "reply": "..."
}

## Commands

/start
Shows the welcome and help message.

/help or help
Shows usage examples.

analyze <chain optional> <address>
Runs ChainGPT-backed CA analysis with token enrichment.

scan <chain optional> <address>
Alias for analyze.

watch <chain optional> <address>
Adds a token to the current DM or group watchlist.

unwatch <chain optional> <address>
Removes a token from the current DM or group watchlist.

watchlist
Shows saved tokens for the current DM or group.

clear watchlist
Clears saved tokens for the current DM or group.

chains
Lists supported networks.

## Environment

Required:
CMB_WHATSAPP_WEBHOOK_SECRET verifies CookMyBots managed WhatsApp webhooks.
COOKMYBOTS_AI_KEY powers ChainGPT CA analysis through CookMyBots AI Gateway.
COOKMYBOTS_AI_ENDPOINT is the CookMyBots AI Gateway base URL.

Recommended:
MONGODB_URI stores watchlists.

Optional:
WEB3_CHAT_MODE defaults to on.
AI_TIMEOUT_MS defaults to 600000.
AI_MAX_RETRIES defaults to 2.
CONCURRENCY defaults to 20.
DEXSCREENER_API_BASE_URL defaults to https://api.dexscreener.com.
GOPLUS_API_KEY and explorer keys improve enrichment.

## Run

npm install
cp .env.sample .env
npm run dev

## Local test

POST http://localhost:3000/test
Body:
{ "text": "analyze eth 0x0000000000000000000000000000000000000000" }

## Notes

The bot does not call OpenAI directly. All AI and ChainGPT calls are centralized in src/lib/ai.js and go through COOKMYBOTS_AI_ENDPOINT with Authorization: Bearer COOKMYBOTS_AI_KEY.
