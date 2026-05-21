const EVM_ADDRESS_RE = /0x[a-fA-F0-9]{40}/g;

export function normalizeAddress(value) {
  const found = String(value || "").match(/0x[a-fA-F0-9]{40}/);
  return found ? found[0].toLowerCase() : "";
}

export function extractAddresses(text) {
  const matches = String(text || "").match(EVM_ADDRESS_RE) || [];
  return [...new Set(matches.map((address) => address.toLowerCase()))];
}

export function shortAddress(address) {
  const value = normalizeAddress(address);
  if (!value) return "unknown";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}
