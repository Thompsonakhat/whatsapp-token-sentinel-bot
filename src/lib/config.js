import "dotenv/config";
import { log } from "./logger.js";

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const cfg = {
  PORT: num(process.env.PORT || "3000", 3000),
  CMB_WHATSAPP_WEBHOOK_SECRET: process.env.CMB_WHATSAPP_WEBHOOK_SECRET || "",

  MONGODB_URI: process.env.MONGODB_URI || "",

  COOKMYBOTS_AI_ENDPOINT: process.env.COOKMYBOTS_AI_ENDPOINT || "https://api.cookmybots.com/api/ai",
  COOKMYBOTS_AI_KEY: process.env.COOKMYBOTS_AI_KEY || "",
  WEB3_CHAT_MODE: process.env.WEB3_CHAT_MODE || "on",
  AI_TIMEOUT_MS: num(process.env.AI_TIMEOUT_MS || "600000", 600000),
  AI_MAX_RETRIES: num(process.env.AI_MAX_RETRIES || "2", 2),
  CONCURRENCY: num(process.env.CONCURRENCY || "20", 20),

  DEXSCREENER_API_BASE_URL: process.env.DEXSCREENER_API_BASE_URL || "https://api.dexscreener.com",
  GOPLUS_API_KEY: process.env.GOPLUS_API_KEY || "",

  ETHERSCAN_API_KEY: process.env.ETHERSCAN_API_KEY || "",
  BSCSCAN_API_KEY: process.env.BSCSCAN_API_KEY || "",
  POLYGONSCAN_API_KEY: process.env.POLYGONSCAN_API_KEY || "",
  ARBISCAN_API_KEY: process.env.ARBISCAN_API_KEY || "",
  OPTIMISTIC_ETHERSCAN_API_KEY: process.env.OPTIMISTIC_ETHERSCAN_API_KEY || "",
  BASESCAN_API_KEY: process.env.BASESCAN_API_KEY || "",
  SNOWTRACE_API_KEY: process.env.SNOWTRACE_API_KEY || ""
};

export function logEnvSanity() {
  log.info("config.loaded", {
    platform: "whatsapp",
    CMB_WHATSAPP_WEBHOOK_SECRET_set: Boolean(cfg.CMB_WHATSAPP_WEBHOOK_SECRET),
    MONGODB_URI_set: Boolean(cfg.MONGODB_URI),
    COOKMYBOTS_AI_ENDPOINT_set: Boolean(cfg.COOKMYBOTS_AI_ENDPOINT),
    COOKMYBOTS_AI_KEY_set: Boolean(cfg.COOKMYBOTS_AI_KEY),
    WEB3_CHAT_MODE: cfg.WEB3_CHAT_MODE,
    ChainGPT_via_CookMyBots_set: Boolean(cfg.COOKMYBOTS_AI_KEY && cfg.COOKMYBOTS_AI_ENDPOINT),
    DEXSCREENER_API_BASE_URL_set: Boolean(cfg.DEXSCREENER_API_BASE_URL),
    GOPLUS_API_KEY_set: Boolean(cfg.GOPLUS_API_KEY),
    ETHERSCAN_API_KEY_set: Boolean(cfg.ETHERSCAN_API_KEY),
    BSCSCAN_API_KEY_set: Boolean(cfg.BSCSCAN_API_KEY),
    POLYGONSCAN_API_KEY_set: Boolean(cfg.POLYGONSCAN_API_KEY),
    ARBISCAN_API_KEY_set: Boolean(cfg.ARBISCAN_API_KEY),
    OPTIMISTIC_ETHERSCAN_API_KEY_set: Boolean(cfg.OPTIMISTIC_ETHERSCAN_API_KEY),
    BASESCAN_API_KEY_set: Boolean(cfg.BASESCAN_API_KEY),
    SNOWTRACE_API_KEY_set: Boolean(cfg.SNOWTRACE_API_KEY)
  });
}
