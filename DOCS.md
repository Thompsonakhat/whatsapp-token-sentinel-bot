# Token Sentinel Bot

Token Sentinel Bot is a CookMyBots managed WhatsApp brain service. Users can paste EVM contract addresses in DMs or groups and receive concise token intelligence reports with market data, token enrichment, watchlists, and ChainGPT-backed CA risk analysis.

This project does not implement WhatsApp Cloud API webhooks and does not use WhatsApp Cloud API credentials. CookMyBots handles WhatsApp connection and forwards messages to this service at POST /webhook/cookmybots/whatsapp.

## WhatsApp text commands

/start
Shows the welcome and help message.

/help
Shows usage examples and supported actions.

help
Shows the same usage examples in natural WhatsApp text.

analyze <address>
Analyzes a contract address with automatic chain detection.
Example: analyze 0x0000000000000000000000000000000000000000

analyze <chain> <address>
Analyzes an address on a specific chain.
Example: analyze base 0x0000000000000000000000000000000000000000

scan <chain> <address>
Short alias for analyze.
Example: scan eth 0x0000000000000000000000000000000000000000

watch <address>
Adds a token to the current DM or group watchlist after resolving it.
Example: watch eth 0x0000000000000000000000000000000000000000

unwatch <address>
Removes a token from the current DM or group watchlist.
Example: unwatch 0x0000000000000000000000000000000000000000

watchlist
Lists tokens saved for the current DM or group chat.

clear watchlist
Clears the current DM or group watchlist.

chains
Lists supported chains and short names.

Automatic detection
If a message contains a 0x-prefixed 40-byte EVM address, the bot analyzes it automatically. In groups, replies are shorter and multiple addresses are summarized to avoid spam.

## ChainGPT CA analysis

Contract address analysis is powered by ChainGPT through the CookMyBots AI Gateway. The bot sends ChainGPT the supported chain, contract address, token identity when available, market data, security signals, explorer verification signals, and missing-data notes.

The final report summarizes token identity, chain or network, overall risk level, important warnings, notable positives, a short recommendation, and fallback deterministic checks. If ChainGPT times out, is rate-limited, or returns incomplete data, the bot keeps running and returns a degraded report using available enrichment instead of exposing raw provider errors.

The bot does not call OpenAI directly. General AI or Web3 analysis features use src/lib/ai.js and COOKMYBOTS_AI_ENDPOINT with Authorization: Bearer COOKMYBOTS_AI_KEY.

## Supported chains

Ethereum, BNB Chain, Polygon, Arbitrum, Optimism, Base, and Avalanche.

## Environment variables

CMB_WHATSAPP_WEBHOOK_SECRET
Required. CookMyBots injects this secret and sends it in the X-CookMyBots-Webhook-Secret header.

PORT
Optional. HTTP port. Defaults to 3000.

MONGODB_URI
Required for persistent watchlists. If missing, analysis still works but watchlists cannot be saved.

COOKMYBOTS_AI_ENDPOINT
CookMyBots AI Gateway base URL. Defaults to https://api.cookmybots.com/api/ai. Do not append /chat or /chaingpt/chat.

COOKMYBOTS_AI_KEY
Required for ChainGPT-backed CA analysis through the CookMyBots AI Gateway. If missing, the bot keeps running and returns degraded token enrichment reports.

WEB3_CHAT_MODE
Optional. Defaults to on so Web3 summaries route through CookMyBots ChainGPT support.

AI_TIMEOUT_MS
Optional. Defaults to 600000 for long-running AI calls.

AI_MAX_RETRIES
Optional. Defaults to 2.

CONCURRENCY
Optional. Defaults to 20, with an internal conservative cap for AI analysis jobs.

DEXSCREENER_API_BASE_URL
Optional. Defaults to https://api.dexscreener.com.

GOPLUS_API_KEY
Optional. Used for GoPlus token security when present. Missing keys do not crash the bot.

ETHERSCAN_API_KEY, BSCSCAN_API_KEY, POLYGONSCAN_API_KEY, ARBISCAN_API_KEY, OPTIMISTIC_ETHERSCAN_API_KEY, BASESCAN_API_KEY, SNOWTRACE_API_KEY
Optional explorer keys for contract verification and proxy checks. Missing keys are reported as unavailable data.

No WhatsApp Cloud API env vars are required. Do not configure WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN, or WhatsApp Cloud API webhook secrets in this repo.

## Setup

1) Install dependencies with npm install.
2) Copy .env.sample to .env.
3) Set CMB_WHATSAPP_WEBHOOK_SECRET and MONGODB_URI.
4) Add COOKMYBOTS_AI_KEY for ChainGPT CA analysis.
5) Run npm run dev locally or npm start in production.

## Build and run

npm run build
npm start

The build script installs dependencies and verifies relative imports.

## Database

MongoDB collections:

watchlists
Stores personal DM and group watchlist items. Unique key: ownerScope, chainId, address.

analysis_history
Reserved for lightweight analysis logs.

token_reports
Reserved for cached token report snapshots.

The code never updates createdAt during upserts. createdAt is only set in $setOnInsert, while updatedAt is set in $set.

## Troubleshooting

If webhook calls return unauthorized, confirm CMB_WHATSAPP_WEBHOOK_SECRET is set and CookMyBots is sending X-CookMyBots-Webhook-Secret.

If watchlist commands fail, set MONGODB_URI.

If ChainGPT analysis is unavailable, set COOKMYBOTS_AI_KEY and confirm COOKMYBOTS_AI_ENDPOINT is a base URL, not a /chat URL.

If security or verification checks say unavailable, add the optional provider key for that chain.

Reports are token risk intelligence only and are not financial advice.
