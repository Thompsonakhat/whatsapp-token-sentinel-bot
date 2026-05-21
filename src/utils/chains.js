import { cfg } from "../lib/config.js";

export const CHAINS = [
  {
    key: "ethereum",
    name: "Ethereum",
    short: "eth",
    chainId: "1",
    dexId: "ethereum",
    explorerApi: "https://api.etherscan.io/api",
    explorerUrl: "https://etherscan.io/address/",
    apiKeyName: "ETHERSCAN_API_KEY",
    aliases: ["eth", "ethereum", "mainnet"]
  },
  {
    key: "bsc",
    name: "BNB Chain",
    short: "bsc",
    chainId: "56",
    dexId: "bsc",
    explorerApi: "https://api.bscscan.com/api",
    explorerUrl: "https://bscscan.com/address/",
    apiKeyName: "BSCSCAN_API_KEY",
    aliases: ["bsc", "bnb", "bnb chain", "binance"]
  },
  {
    key: "polygon",
    name: "Polygon",
    short: "polygon",
    chainId: "137",
    dexId: "polygon",
    explorerApi: "https://api.polygonscan.com/api",
    explorerUrl: "https://polygonscan.com/address/",
    apiKeyName: "POLYGONSCAN_API_KEY",
    aliases: ["polygon", "matic", "poly"]
  },
  {
    key: "arbitrum",
    name: "Arbitrum",
    short: "arb",
    chainId: "42161",
    dexId: "arbitrum",
    explorerApi: "https://api.arbiscan.io/api",
    explorerUrl: "https://arbiscan.io/address/",
    apiKeyName: "ARBISCAN_API_KEY",
    aliases: ["arb", "arbitrum", "arbitrum one"]
  },
  {
    key: "optimism",
    name: "Optimism",
    short: "op",
    chainId: "10",
    dexId: "optimism",
    explorerApi: "https://api-optimistic.etherscan.io/api",
    explorerUrl: "https://optimistic.etherscan.io/address/",
    apiKeyName: "OPTIMISTIC_ETHERSCAN_API_KEY",
    aliases: ["op", "optimism", "optimistic"]
  },
  {
    key: "base",
    name: "Base",
    short: "base",
    chainId: "8453",
    dexId: "base",
    explorerApi: "https://api.basescan.org/api",
    explorerUrl: "https://basescan.org/address/",
    apiKeyName: "BASESCAN_API_KEY",
    aliases: ["base"]
  },
  {
    key: "avalanche",
    name: "Avalanche",
    short: "avax",
    chainId: "43114",
    dexId: "avalanche",
    explorerApi: "https://api.snowtrace.io/api",
    explorerUrl: "https://snowtrace.io/address/",
    apiKeyName: "SNOWTRACE_API_KEY",
    aliases: ["avax", "avalanche", "c-chain", "cchain"]
  }
];

export function findChain(input) {
  const value = String(input || "").toLowerCase().trim();
  if (!value) return null;
  return CHAINS.find((chain) => chain.aliases.includes(value) || chain.key === value || chain.chainId === value) || null;
}

export function detectChainHint(text) {
  const normalized = String(text || "").toLowerCase();
  for (const chain of CHAINS) {
    for (const alias of chain.aliases) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(^|\\s)${escaped}(\\s|:|,|$)`, "i");
      if (re.test(normalized)) return chain;
    }
  }
  return null;
}

export function explorerKeyFor(chain) {
  return cfg[chain?.apiKeyName] || "";
}

export function supportedChainsText() {
  return CHAINS.map((chain) => `${chain.name} (${chain.short})`).join(", ");
}
