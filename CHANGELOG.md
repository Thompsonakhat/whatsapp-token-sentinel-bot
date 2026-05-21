# Changelog

All notable changes to this bot project are recorded here.

## 2026-05-21 05:01:53. UTC
- Request: can we use chaingpt instead for CA analysis
- Summary: Refined CA analysis to use ChainGPT through the CookMyBots AI Gateway as the primary risk provider, preserved token enrichment and watchlists, updated help/docs/env samples, and kept WhatsApp managed transport only. Per…
- Files: .env.sample, DOCS.md, README.md, package.json, src/handlers/messages.js, src/lib/ai.js, src/lib/botProfile.js, src/lib/config.js, src/services/riskAssessment.js

## 2026-05-21 04:56:25. UTC
- Request: Idea: - Create a WhatsApp bot for token intelligence. - Analyze token contract addresses with real-time data. - Provide risk assessments using AI. Platform: WhatsApp Goal: - Enable users to paste contract addresses for …
- Summary: Built the WhatsApp Token Sentinel brain service with EVM address detection, token reports, AI risk summaries, MongoDB watchlists, provider fallbacks, safe logging, and DOCS.md.
- Files: .env.sample, DOCS.md, package.json, project.json, scripts/verify-imports.js, src/bot.js, src/brain.js, src/handlers/messages.js, src/index.js, src/lib/ai.js, src/lib/botProfile.js, src/lib/config.js, src/lib/db.js, src/lib/logger.js (+6 more)

