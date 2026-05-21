import { cfg } from "./config.js";
import { log, safeErr } from "./logger.js";
import { buildBotProfile } from "./botProfile.js";

function baseUrl() {
  return String(cfg.COOKMYBOTS_AI_ENDPOINT || "https://api.cookmybots.com/api/ai").replace(/\/+$/, "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.AI_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (!res.ok) {
      const message = json?.error || json?.message || text || `HTTP ${res.status}`;
      throw new Error(message);
    }

    return json || {};
  } finally {
    clearTimeout(timer);
  }
}

async function callGateway(route, body, feature) {
  if (!cfg.COOKMYBOTS_AI_KEY) {
    log.warn("ai.skipped", { platform: "whatsapp", feature, reason: "COOKMYBOTS_AI_KEY missing" });
    return null;
  }

  const url = `${baseUrl()}${route}`;
  let attempt = 0;

  while (attempt <= cfg.AI_MAX_RETRIES) {
    attempt += 1;
    try {
      log.info("ai.call_start", { platform: "whatsapp", feature, route, attempt });
      const json = await fetchJsonWithTimeout(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.COOKMYBOTS_AI_KEY}`
        },
        body: JSON.stringify(body)
      });
      log.info("ai.call_success", { platform: "whatsapp", feature, route, attempt, ok: Boolean(json?.ok !== false) });
      return json;
    } catch (err) {
      log.error("ai.call_failure", { platform: "whatsapp", feature, route, attempt, error: safeErr(err) });
      if (attempt > cfg.AI_MAX_RETRIES) throw err;
      await sleep(500 * attempt);
    }
  }

  return null;
}

export async function aiRiskSummary({ facts, deterministicLabel }) {
  const botProfile = buildBotProfile();
  const compactFacts = JSON.stringify(facts, null, 2).slice(0, 8000);
  const prompt = [
    botProfile,
    "Summarize these token risk facts in 1 to 3 short WhatsApp-friendly sentences.",
    "Use the deterministic rating unless facts clearly support the same or stricter wording.",
    "Do not invent unavailable metrics. Mention uncertainty when important data is missing.",
    `Deterministic rating: ${deterministicLabel || "Unknown"}`,
    compactFacts
  ].join("\n\n");

  try {
    if (String(cfg.WEB3_CHAT_MODE || "on").toLowerCase() !== "off") {
      const json = await callGateway("/chaingpt/chat", {
        mode: "web3",
        question: prompt,
        meta: { platform: "whatsapp", feature: "token-risk-summary" }
      }, "risk_summary_web3");
      return String(json?.output?.content || json?.output?.text || "").trim() || null;
    }

    const json = await callGateway("/chat", {
      messages: [
        { role: "system", content: botProfile },
        { role: "system", content: "Use only provided facts. Do not fabricate token data." },
        { role: "user", content: prompt }
      ],
      meta: { platform: "whatsapp", feature: "token-risk-summary" }
    }, "risk_summary_chat");

    return String(json?.output?.content || "").trim() || null;
  } catch (err) {
    log.error("ai.summary_failure", { platform: "whatsapp", error: safeErr(err) });
    return null;
  }
}
