import { aiContractAnalysis } from "../lib/ai.js";
import { shortAddress } from "../utils/address.js";

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function yes(value) {
  return String(value || "").toLowerCase() === "1" || String(value || "").toLowerCase() === "true";
}

function usd(value) {
  const n = asNumber(value);
  if (n === null) return "Unavailable";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function pct(value) {
  const n = asNumber(value);
  return n === null ? "Unavailable" : `${n.toFixed(2)}%`;
}

function ageText(pairCreatedAt) {
  const n = Number(pairCreatedAt);
  if (!Number.isFinite(n) || n <= 0) return "Unavailable";
  const ageMs = Date.now() - n;
  const days = Math.max(0, Math.floor(ageMs / 86_400_000));
  if (days === 0) return "Less than 1 day";
  if (days === 1) return "1 day";
  return `${days} days`;
}

function parseJsonObject(text) {
  const value = String(text || "").trim();
  if (!value) return null;

  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  try {
    return JSON.parse(value.slice(start, end + 1));
  } catch {
    return null;
  }
}

function asList(value, fallback = []) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 5);
  if (typeof value === "string" && value.trim()) return [value.trim()].slice(0, 5);
  return fallback.slice(0, 5);
}

function inferRiskLevel(text, fallback) {
  const value = String(text || "").toLowerCase();
  if (value.includes("critical")) return "Critical";
  if (value.includes("high risk") || value.includes("risk level: high") || value.includes('"riskLevel":"High"'.toLowerCase())) return "High";
  if (value.includes("medium risk") || value.includes("moderate risk") || value.includes("risk level: medium")) return "Medium";
  if (value.includes("low risk") || value.includes("risk level: low")) return "Low";
  return fallback || "Unknown";
}

function normalizeChainGpt(result, deterministic, data) {
  const parsed = parseJsonObject(result?.content);
  const fallbackWarnings = deterministic.signals.slice(0, 5);
  const tokenIdentity = parsed?.tokenIdentity || `${data?.market?.name || data?.explorer?.contractName || "Unknown token"} (${data?.market?.symbol || "UNKNOWN"})`;

  if (!result?.available) {
    return {
      available: false,
      riskLevel: deterministic.label,
      tokenIdentity,
      warnings: fallbackWarnings,
      positives: [],
      recommendation: "ChainGPT analysis is unavailable right now. Treat this as a degraded report and verify independently before trading.",
      confidence: "Low",
      raw: result?.content || ""
    };
  }

  return {
    available: true,
    riskLevel: String(parsed?.riskLevel || inferRiskLevel(result.content, deterministic.label)),
    tokenIdentity: String(parsed?.tokenIdentity || tokenIdentity),
    chain: String(parsed?.chain || data?.chain?.name || "Unknown chain"),
    warnings: asList(parsed?.warnings, fallbackWarnings),
    positives: asList(parsed?.positives, []),
    recommendation: String(parsed?.recommendation || result.content).slice(0, 900),
    confidence: String(parsed?.confidence || "Medium"),
    raw: result.content
  };
}

export function deterministicRisk(data) {
  const signals = [];
  let score = 0;
  const security = data?.security || {};
  const market = data?.market || {};
  const explorer = data?.explorer || {};

  if (yes(security.is_honeypot)) {
    score += 50;
    signals.push("Honeypot flag reported by security provider");
  }

  if (yes(security.is_blacklisted) || yes(security.is_in_dex) === false) {
    score += 20;
    signals.push("Blacklist or trading availability concern reported");
  }

  const buyTax = asNumber(security.buy_tax);
  const sellTax = asNumber(security.sell_tax);
  if (buyTax !== null && buyTax > 0.1) {
    score += buyTax > 0.2 ? 25 : 12;
    signals.push(`High buy tax detected: ${(buyTax * 100).toFixed(2)}%`);
  }
  if (sellTax !== null && sellTax > 0.1) {
    score += sellTax > 0.2 ? 30 : 14;
    signals.push(`High sell tax detected: ${(sellTax * 100).toFixed(2)}%`);
  }

  if (yes(security.can_take_back_ownership) || yes(security.owner_change_balance) || yes(security.hidden_owner)) {
    score += 25;
    signals.push("Ownership/admin control concern detected");
  }

  if (yes(security.is_proxy) || explorer.proxy) {
    score += 12;
    signals.push("Proxy or upgradeable contract pattern detected");
  }

  if (security.is_open_source !== undefined && !yes(security.is_open_source) && !explorer.verified) {
    score += 15;
    signals.push("Contract source verification unavailable or not open source");
  }

  const liquidity = asNumber(market.liquidityUsd);
  if (liquidity === null) {
    score += 10;
    signals.push("Liquidity data unavailable");
  } else if (liquidity < 10_000) {
    score += 25;
    signals.push("Very low liquidity");
  } else if (liquidity < 50_000) {
    score += 12;
    signals.push("Thin liquidity");
  }

  const age = Number(market.pairCreatedAt);
  if (Number.isFinite(age) && Date.now() - age < 86_400_000) {
    score += 15;
    signals.push("Pair appears less than 24 hours old");
  }

  const holders = Array.isArray(security.holders) ? security.holders : [];
  const topHolder = holders[0]?.percent ? asNumber(holders[0].percent) : null;
  if (topHolder !== null && topHolder > 20) {
    score += topHolder > 50 ? 25 : 12;
    signals.push(`Top holder concentration: ${topHolder.toFixed(2)}%`);
  }

  const label = score >= 70 ? "Critical" : score >= 45 ? "High" : score >= 20 ? "Medium" : "Low";

  if (!signals.length) signals.push("No major deterministic warning found from available data");

  return {
    score,
    label,
    signals: signals.slice(0, 8)
  };
}

export async function assessToken(data) {
  const deterministic = deterministicRisk(data);
  const chainGptResult = await aiContractAnalysis({ data, deterministic });
  const chainGpt = normalizeChainGpt(chainGptResult, deterministic, data);

  return {
    deterministic,
    chainGpt,
    overallRisk: chainGpt.riskLevel || deterministic.label
  };
}

export function formatReport(data, assessment, { short = false, watchHint = true } = {}) {
  const market = data.market || {};
  const security = data.security || {};
  const explorer = data.explorer || {};
  const risk = assessment.deterministic;
  const chainGpt = assessment.chainGpt || {};
  const missing = data.missing?.length ? data.missing.join(", ") : "None noted";
  const source = market.pairUrl || explorer.explorerUrl || "Unavailable";
  const tokenName = market.name || explorer.contractName || "Unknown token";
  const tokenSymbol = market.symbol || "UNKNOWN";
  const warnings = asList(chainGpt.warnings, risk.signals).slice(0, short ? 3 : 5);
  const positives = asList(chainGpt.positives, []).slice(0, short ? 2 : 4);

  const lines = [
    "Token",
    `${tokenName} (${tokenSymbol}) on ${data.chain?.name || "Unknown chain"}`,
    `Address: ${shortAddress(data.address)}`,
    "",
    "Market",
    `Price: ${market.priceUsd ? `$${market.priceUsd}` : "Unavailable"}`,
    `Liquidity: ${usd(market.liquidityUsd)} | FDV/MCap: ${usd(market.marketCap || market.fdv)}`,
    `24h volume: ${usd(market.volume24h)} | 24h change: ${pct(market.priceChange24h)}`,
    "",
    "ChainGPT Risk",
    `Overall risk: ${assessment.overallRisk || risk.label}`,
    `Confidence: ${chainGpt.confidence || "Unavailable"}`,
    `Warnings: ${warnings.length ? warnings.join("; ") : "No major warning returned"}`,
    `Positives: ${positives.length ? positives.join("; ") : "None confirmed"}`,
    `Recommendation: ${chainGpt.recommendation || "Verify independently before trading."}`,
    "",
    "Data Checks",
    `Fallback score: ${risk.label} (${risk.score}/100)`,
    `Buy tax: ${security.buy_tax !== undefined ? pct(asNumber(security.buy_tax) * 100) : "Unavailable"} | Sell tax: ${security.sell_tax !== undefined ? pct(asNumber(security.sell_tax) * 100) : "Unavailable"}`,
    `Verified: ${explorer.verified === true ? "Yes" : explorer.verified === false ? "No" : "Unavailable"} | Proxy: ${explorer.proxy === true ? "Yes" : explorer.proxy === false ? "No" : "Unavailable"}`,
    `Age: ${ageText(market.pairCreatedAt)}`,
    `Unavailable data: ${missing}`,
    "",
    "Links",
    source
  ];

  if (!chainGpt.available) {
    lines.splice(10, 0, "ChainGPT is temporarily unavailable, so this is a degraded report using token enrichment and fallback checks.");
  }

  if (watchHint) {
    lines.push("", "Watchlist Hint", `Send watch ${data.chain?.short || "eth"} ${data.address} to track it here.`);
  }

  if (!short) {
    lines.push("", "Not financial advice. Verify independently before trading.");
  }

  return lines.join("\n").slice(0, 3900);
}

export function formatBrief(data, assessment) {
  const market = data.market || {};
  const riskLevel = assessment.overallRisk || assessment.deterministic?.label || "Unknown";
  const warning = assessment.chainGpt?.warnings?.[0] || assessment.deterministic?.signals?.[0] || "No major warning returned";
  return `${market.symbol || "UNKNOWN"} on ${data.chain?.name || "Unknown"}: ${riskLevel} risk, liquidity ${usd(market.liquidityUsd)}, 24h ${pct(market.priceChange24h)}. ${warning}. ${shortAddress(data.address)}`;
}
