import { cfg } from "../lib/config.js";
import { log, safeErr } from "../lib/logger.js";
import { normalizeAddress } from "../utils/address.js";
import { CHAINS, explorerKeyFor, findChain } from "../utils/chains.js";

const cache = new Map();
const CACHE_MS = 60_000;

function now() {
  return Date.now();
}

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function fetchJson(provider, url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    log.info("token_api.call_start", { provider });
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(json?.message || json?.error || `HTTP ${res.status}`);
    log.info("token_api.call_success", { provider });
    return json;
  } catch (err) {
    log.error("token_api.call_failure", { provider, error: safeErr(err) });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function pickBestPair(pairs) {
  const list = Array.isArray(pairs) ? pairs : [];
  return list
    .filter(Boolean)
    .sort((a, b) => money(b?.liquidity?.usd) - money(a?.liquidity?.usd))[0] || null;
}

function normalizeMarket(pair, chain, address) {
  if (!pair) {
    return {
      chain,
      address,
      unavailable: true,
      missing: ["DexScreener market data unavailable"]
    };
  }

  const token = String(pair?.baseToken?.address || "").toLowerCase() === address
    ? pair.baseToken
    : pair.quoteToken || pair.baseToken;

  return {
    chain,
    address,
    name: token?.name || "Unknown token",
    symbol: token?.symbol || "UNKNOWN",
    priceUsd: pair?.priceUsd || null,
    liquidityUsd: money(pair?.liquidity?.usd),
    fdv: money(pair?.fdv),
    marketCap: money(pair?.marketCap),
    volume24h: money(pair?.volume?.h24),
    priceChange24h: money(pair?.priceChange?.h24),
    dexId: pair?.dexId || "Unknown DEX",
    pairAddress: pair?.pairAddress || "",
    pairUrl: pair?.url || "",
    pairCreatedAt: pair?.pairCreatedAt || null,
    missing: []
  };
}

export async function fetchDexMarket(chain, address) {
  const cacheKey = `dex:${chain.key}:${address}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now()) return cached.value;

  const base = String(cfg.DEXSCREENER_API_BASE_URL || "https://api.dexscreener.com").replace(/\/+$/, "");
  const url = `${base}/tokens/v1/${encodeURIComponent(chain.dexId)}/${encodeURIComponent(address)}`;
  const json = await fetchJson("DexScreener", url);
  const pair = pickBestPair(Array.isArray(json) ? json : json?.pairs);
  const value = normalizeMarket(pair, chain, address);
  cache.set(cacheKey, { value, expiresAt: now() + CACHE_MS });
  return value;
}

async function fetchGoPlus(chain, address) {
  const headers = cfg.GOPLUS_API_KEY ? { Authorization: `Bearer ${cfg.GOPLUS_API_KEY}` } : {};
  const url = `https://api.gopluslabs.io/api/v1/token_security/${chain.chainId}?contract_addresses=${encodeURIComponent(address)}`;
  const json = await fetchJson("GoPlus", url, { headers });
  const result = json?.result?.[address] || json?.result?.[address.toLowerCase()] || null;

  if (!result) {
    return {
      unavailable: true,
      reason: "GoPlus security data unavailable for this token"
    };
  }

  return result;
}

async function fetchExplorer(chain, address) {
  const apiKey = explorerKeyFor(chain);
  if (!apiKey) {
    return {
      unavailable: true,
      reason: `${chain.name} explorer API key not set`
    };
  }

  const url = `${chain.explorerApi}?module=contract&action=getsourcecode&address=${encodeURIComponent(address)}&apikey=${encodeURIComponent(apiKey)}`;
  const json = await fetchJson(`${chain.name} explorer`, url);
  const row = Array.isArray(json?.result) ? json.result[0] : null;

  if (!row) {
    return {
      unavailable: true,
      reason: "Explorer contract source data unavailable"
    };
  }

  return {
    contractName: row.ContractName || "",
    verified: Boolean(row.SourceCode && row.ABI !== "Contract source code not verified"),
    proxy: row.Proxy === "1",
    implementation: row.Implementation || "",
    explorerUrl: `${chain.explorerUrl}${address}`
  };
}

function confidenceForMarket(market) {
  const liquidity = money(market?.liquidityUsd) || 0;
  const volume = money(market?.volume24h) || 0;
  return liquidity + volume;
}

export async function resolveTokenAddress(addressInput, chainHintInput = null) {
  const address = normalizeAddress(addressInput);
  if (!address) {
    return { error: "Invalid EVM contract address" };
  }

  const hinted = chainHintInput ? findChain(chainHintInput.key || chainHintInput) : null;
  if (hinted) {
    const market = await fetchDexMarket(hinted, address);
    return { address, chain: hinted, market, ambiguous: false };
  }

  const results = await Promise.all(CHAINS.map(async (chain) => {
    const market = await fetchDexMarket(chain, address);
    return { chain, market, confidence: confidenceForMarket(market) };
  }));

  const active = results
    .filter((item) => item.confidence > 0 || !item.market?.unavailable)
    .sort((a, b) => b.confidence - a.confidence);

  if (active.length > 1 && active[0].confidence > 0 && active[1].confidence > 0 && active[0].confidence < active[1].confidence * 1.5) {
    return {
      address,
      ambiguous: true,
      options: active.slice(0, 4).map((item) => ({
        chain: item.chain,
        market: item.market,
        confidence: item.confidence
      }))
    };
  }

  const best = active[0] || results[0];
  return {
    address,
    chain: best.chain,
    market: best.market,
    ambiguous: false
  };
}

export async function getTokenIntelligence(addressInput, chainHint = null) {
  const resolved = await resolveTokenAddress(addressInput, chainHint);
  if (resolved.error || resolved.ambiguous) return resolved;

  const { address, chain, market } = resolved;
  const [security, explorer] = await Promise.all([
    fetchGoPlus(chain, address),
    fetchExplorer(chain, address)
  ]);

  const missing = [];
  if (market?.unavailable) missing.push("market data");
  if (security?.unavailable) missing.push(security.reason || "security data");
  if (explorer?.unavailable) missing.push(explorer.reason || "explorer verification data");

  return {
    address,
    chain,
    market,
    security,
    explorer,
    missing,
    analyzedAt: new Date().toISOString()
  };
}
