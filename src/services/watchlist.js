import { getCollection } from "../lib/db.js";
import { log, safeErr } from "../lib/logger.js";
import { normalizeAddress, shortAddress } from "../utils/address.js";

export function scopeFromMessage(ctx) {
  if (ctx.isGroup) return `group:${ctx.chatId}`;
  return `dm:${ctx.from}`;
}

async function collection() {
  return getCollection("watchlists");
}

export async function addWatchlistItem(ctx, data) {
  const col = await collection();
  if (!col) {
    return { ok: false, message: "Watchlists need MONGODB_URI. Analysis still works, but I cannot save tokens yet." };
  }

  const address = normalizeAddress(data.address);
  const ownerScope = scopeFromMessage(ctx);
  const now = new Date();
  const mutable = {
    ownerScope,
    scopeType: ctx.isGroup ? "group" : "dm",
    chatId: ctx.chatId,
    chainId: data.chain.chainId,
    chainKey: data.chain.key,
    chainName: data.chain.name,
    address,
    symbol: data.market?.symbol || "UNKNOWN",
    name: data.market?.name || "Unknown token",
    addedBy: ctx.from || "unknown",
    updatedAt: now
  };

  delete mutable._id;
  delete mutable.createdAt;

  try {
    await col.updateOne(
      { ownerScope, chainId: data.chain.chainId, address },
      {
        $setOnInsert: { createdAt: now },
        $set: mutable
      },
      { upsert: true }
    );
    return { ok: true, message: `${mutable.symbol} on ${mutable.chainName} is on this ${ctx.isGroup ? "group" : "DM"} watchlist.` };
  } catch (err) {
    log.error("db.write_failure", { collection: "watchlists", operation: "updateOne", error: safeErr(err) });
    return { ok: false, message: "I could not save that watchlist item. Please try again." };
  }
}

export async function removeWatchlistItem(ctx, addressInput, chain = null) {
  const col = await collection();
  if (!col) return "Watchlists need MONGODB_URI before I can remove saved tokens.";

  const address = normalizeAddress(addressInput);
  const ownerScope = scopeFromMessage(ctx);
  const filter = chain ? { ownerScope, chainId: chain.chainId, address } : { ownerScope, address };

  try {
    const result = await col.deleteMany(filter);
    if (!result.deletedCount) return `I did not find ${shortAddress(address)} on this watchlist.`;
    return `Removed ${shortAddress(address)} from this watchlist.`;
  } catch (err) {
    log.error("db.write_failure", { collection: "watchlists", operation: "deleteMany", error: safeErr(err) });
    return "I could not update the watchlist. Please try again.";
  }
}

export async function listWatchlist(ctx) {
  const col = await collection();
  if (!col) return "Watchlists need MONGODB_URI before I can save or list tokens.";

  const ownerScope = scopeFromMessage(ctx);
  try {
    const rows = await col.find({ ownerScope }).sort({ updatedAt: -1 }).limit(30).toArray();
    if (!rows.length) return "This watchlist is empty. Send watch <address> to add a token.";
    const lines = rows.map((row, index) => `${index + 1}) ${row.symbol || "UNKNOWN"} on ${row.chainName || row.chainKey}: ${shortAddress(row.address)}`);
    return `Watchlist for this ${ctx.isGroup ? "group" : "DM"}\n${lines.join("\n")}`;
  } catch (err) {
    log.error("db.read_failure", { collection: "watchlists", operation: "find", error: safeErr(err) });
    return "I could not read the watchlist. Please try again.";
  }
}

export async function clearWatchlist(ctx) {
  const col = await collection();
  if (!col) return "Watchlists need MONGODB_URI before I can clear saved tokens.";

  const ownerScope = scopeFromMessage(ctx);
  try {
    const result = await col.deleteMany({ ownerScope });
    return `Cleared ${result.deletedCount || 0} token(s) from this ${ctx.isGroup ? "group" : "DM"} watchlist.`;
  } catch (err) {
    log.error("db.write_failure", { collection: "watchlists", operation: "deleteMany", error: safeErr(err) });
    return "I could not clear the watchlist. Please try again.";
  }
}
