import { aiRiskSummary } from "../lib/ai.js";
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
  const aiSummary = await aiRiskSummary({
    facts: {
      chain: data?.chain?.name,
      address: data?.address,
      market: data?.market,
      security: data?.security,
      explorer: data?.explorer,
      missing: data?.missing,
      deterministic
    },
    deterministicLabel: deterministic.label
  });

  return {
    deterministic,
    aiSummary: aiSummary || `${deterministic.label} risk based on available checks. ${deterministic.signals.slice(0, 2).join(" ")}`
  };
}

export function formatReport(data, assessment, { short = false, watchHint = true } = {}) {
  const market = data.market || {};
  const security = data.security || {};
  const explorer = data.explorer || {};
  const risk = assessment.deterministic;
  const missing = data.missing?.length ? data.missing.join(", ") : "None noted";
  const source = market.pairUrl || explorer.explorerUrl || "Unavailable";
  const tokenName = market.name || explorer.contractName || "Unknown token";
  const tokenSymbol = market.symbol || "UNKNOWN";

  const lines = [
    `Token`,
    `${tokenName} (${tokenSymbol}) on ${data.chain?.name || "Unknown chain"}`,
    `Address: ${shortAddress(data.address)}`,
    `Source: ${market.dexId || "Unavailable"}`,
    "",
    `Market`,
    `Price: ${market.priceUsd ? `$${market.priceUsd}` : "Unavailable"}`,
    `Liquidity: ${usd(market.liquidityUsd)} | FDV/MCap: ${usd(market.marketCap || market.fdv)}`,
    `24h volume: ${usd(market.volume24h)} | 24h change: ${pct(market.priceChange24h)}`,
    "",
    `Risk Signals`,
    `Rating: ${risk.label} (${risk.score}/100)`,
    risk.signals.slice(0, short ? 3 : 6).join("; "),
    `Buy tax: ${security.buy_tax !== undefined ? pct(asNumber(security.buy_tax) * 100) : "Unavailable"} | Sell tax: ${security.sell_tax !== undefined ? pct(asNumber(security.sell_tax) * 100) : "Unavailable"}`,
    `Verified: ${explorer.verified === true ? "Yes" : explorer.verified === false ? "No" : "Unavailable"} | Proxy: ${explorer.proxy === true ? "Yes" : explorer.proxy === false ? "No" : "Unavailable"}`,
    `Age: ${ageText(market.pairCreatedAt)}`,
    `Unavailable data: ${missing}`,
    "",
    `AI Summary`,
    assessment.aiSummary,
    "",
    `Links`,
    source
  ];

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
  return `${market.symbol || "UNKNOWN"} on ${data.chain?.name || "Unknown"}: ${assessment.deterministic.label} risk, liquidity ${usd(market.liquidityUsd)}, 24h ${pct(market.priceChange24h)}. ${shortAddress(data.address)}`;
}
