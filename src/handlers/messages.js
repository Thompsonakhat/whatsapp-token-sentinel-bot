import { cfg } from "../lib/config.js";
import { log, safeErr } from "../lib/logger.js";
import { extractAddresses, shortAddress } from "../utils/address.js";
import { detectChainHint, findChain, supportedChainsText } from "../utils/chains.js";
import { getTokenIntelligence } from "../services/tokenData.js";
import { assessToken, formatBrief, formatReport } from "../services/riskAssessment.js";
import { addWatchlistItem, clearWatchlist, listWatchlist, removeWatchlistItem } from "../services/watchlist.js";

const inFlightByChat = new Set();
let globalInFlight = 0;
const globalCap = Math.max(1, Math.min(Number(cfg.CONCURRENCY || 20), 2));

function normalizeCtx(body) {
  const from = String(body?.from || body?.sender || "anon").trim() || "anon";
  const chatId = String(body?.chatId || body?.conversationId || body?.from || from).trim() || from;
  const text = String(body?.text || body?.message || "").trim();
  const isGroup = Boolean(body?.isGroup) || chatId.endsWith("@g.us") || from.endsWith("@g.us");

  return {
    from,
    chatId,
    text,
    isGroup,
    messageId: String(body?.messageId || ""),
    projectId: String(body?.projectId || ""),
    platform: String(body?.platform || "whatsapp"),
    source: String(body?.source || "cookmybots"),
    timestamp: body?.timestamp || new Date().toISOString(),
    raw: body
  };
}

function helpText() {
  return [
    "Token Sentinel Bot",
    "Paste an EVM contract address and I will analyze token, market, liquidity, and ChainGPT risk signals.",
    "",
    "Try:",
    "/start",
    "/help",
    "analyze 0x...",
    "analyze base 0x...",
    "watch 0x...",
    "unwatch 0x...",
    "watchlist",
    "clear watchlist",
    "chains",
    "",
    "In groups, I keep replies shorter. Reports are not financial advice."
  ].join("\n");
}

function wantsHelp(text) {
  const lower = text.toLowerCase();
  return lower === "/start" || lower === "/help" || lower === "help" || lower === "hi" || lower === "hello" || lower.includes("what can you do");
}

function intentOf(text) {
  const lower = text.toLowerCase().trim();
  if (wantsHelp(text)) return "help";
  if (lower === "chains" || lower === "supported chains") return "chains";
  if (lower === "watchlist" || lower === "list watchlist") return "watchlist";
  if (lower === "clear watchlist") return "clear_watchlist";
  if (lower.startsWith("unwatch ") || lower.startsWith("remove ")) return "unwatch";
  if (lower.startsWith("watch ") || lower.startsWith("add ") || lower.includes(" add ")) return "watch";
  if (lower.startsWith("analyze ") || lower.startsWith("scan ") || lower.startsWith("check ") || lower.startsWith("full ") || lower.startsWith("refresh ")) return "analyze";
  return "auto";
}

async function withAnalysisLock(ctx, fn) {
  const key = ctx.chatId || ctx.from;
  if (inFlightByChat.has(key)) {
    return "I’m working on your last request. Please wait a moment.";
  }

  if (globalInFlight >= globalCap) {
    return "I’m handling other token checks right now. Please retry shortly.";
  }

  inFlightByChat.add(key);
  globalInFlight += 1;
  try {
    return await fn();
  } finally {
    inFlightByChat.delete(key);
    globalInFlight = Math.max(0, globalInFlight - 1);
  }
}

function ambiguityReply(resolved) {
  const options = resolved.options || [];
  const lines = options.map((item, index) => {
    const m = item.market || {};
    return `${index + 1}) ${item.chain.name}: ${m.symbol || "UNKNOWN"}, liquidity ${m.liquidityUsd ? `$${Math.round(m.liquidityUsd)}` : "unavailable"}`;
  });
  return `That address appears on multiple chains. Please specify one.\n${lines.join("\n")}\nExample: analyze base ${resolved.address}`;
}

async function analyzeOne(ctx, address, { chainHint = null, short = false } = {}) {
  const data = await getTokenIntelligence(address, chainHint);
  if (data.error) return `${data.error}. Send a 0x-prefixed EVM contract address. Supported networks: ${supportedChainsText()}.`;
  if (data.ambiguous) return ambiguityReply(data);

  const assessment = await assessToken(data);
  return formatReport(data, assessment, { short: short || ctx.isGroup, watchHint: true });
}

async function summarizeMany(ctx, addresses, chainHint) {
  const selected = addresses.slice(0, 3);
  const lines = [];

  for (const address of selected) {
    const data = await getTokenIntelligence(address, chainHint);
    if (data.error) {
      lines.push(`${shortAddress(address)}: ${data.error}`);
      continue;
    }
    if (data.ambiguous) {
      lines.push(`${shortAddress(address)}: appears on multiple chains. Specify a chain for details.`);
      continue;
    }
    const assessment = await assessToken(data);
    lines.push(formatBrief(data, assessment));
  }

  if (addresses.length > selected.length) {
    lines.push(`I skipped ${addresses.length - selected.length} extra address(es) to avoid spam.`);
  }

  lines.push("Send analyze <chain> <address> for a full check on one token.");
  return lines.join("\n");
}

export async function handleWhatsAppMessage(body) {
  const ctx = normalizeCtx(body);
  const text = ctx.text;

  if (!text) return "Send a token contract address or type help.";

  const intent = intentOf(text);
  const addresses = extractAddresses(text);
  const chainHint = detectChainHint(text);

  log.info("message.received", {
    platform: "whatsapp",
    isGroup: ctx.isGroup,
    intent,
    addressCount: addresses.length,
    messageIdSet: Boolean(ctx.messageId)
  });

  if (intent === "help") return helpText();
  if (intent === "chains") return `Supported chains: ${supportedChainsText()}`;
  if (intent === "watchlist") return listWatchlist(ctx);
  if (intent === "clear_watchlist") return clearWatchlist(ctx);

  if (intent === "unwatch") {
    if (!addresses.length) return "Send unwatch <address>. You can add a chain too, like unwatch base 0x...";
    return removeWatchlistItem(ctx, addresses[0], chainHint ? findChain(chainHint.key) : null);
  }

  if (intent === "watch") {
    if (!addresses.length) return "Send watch <address>, or watch base <address>.";
    return withAnalysisLock(ctx, async () => {
      const data = await getTokenIntelligence(addresses[0], chainHint);
      if (data.error) return data.error;
      if (data.ambiguous) return ambiguityReply(data);
      const saved = await addWatchlistItem(ctx, data);
      return saved.message;
    });
  }

  if (!addresses.length) {
    if (intent === "analyze") {
      return `Send analyze <chain optional> <0x contract address>. Supported networks: ${supportedChainsText()}.`;
    }
    return ctx.isGroup ? "" : "Send an EVM contract address, or type help for examples.";
  }

  return withAnalysisLock(ctx, async () => {
    try {
      if (addresses.length > 1) {
        return summarizeMany(ctx, addresses, chainHint);
      }
      return analyzeOne(ctx, addresses[0], { chainHint, short: ctx.isGroup });
    } catch (err) {
      log.error("analysis.failure", { platform: "whatsapp", error: safeErr(err) });
      return "I could not complete that token check. Please try again in a moment.";
    }
  });
}
