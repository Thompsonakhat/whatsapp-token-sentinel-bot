import { MongoClient } from "mongodb";
import { cfg } from "./config.js";
import { log, safeErr } from "./logger.js";

let client = null;
let db = null;
let indexesReady = false;

export async function connectDb() {
  if (!cfg.MONGODB_URI) {
    log.warn("db.skipped", { reason: "MONGODB_URI not set" });
    return null;
  }

  if (db) return db;

  try {
    client = new MongoClient(cfg.MONGODB_URI, { ignoreUndefined: true });
    await client.connect();
    db = client.db();
    log.info("db.connected", { configured: true });
    await ensureIndexes();
    return db;
  } catch (err) {
    log.error("db.connect_failure", { error: safeErr(err) });
    client = null;
    db = null;
    return null;
  }
}

export async function getDb() {
  return db || connectDb();
}

export async function getCollection(name) {
  const activeDb = await getDb();
  if (!activeDb) return null;
  return activeDb.collection(name);
}

export async function ensureIndexes() {
  if (!db || indexesReady) return;

  try {
    await db.collection("watchlists").createIndex(
      { ownerScope: 1, chainId: 1, address: 1 },
      { unique: true }
    );
    await db.collection("watchlists").createIndex({ ownerScope: 1, updatedAt: -1 });
    await db.collection("analysis_history").createIndex({ chatId: 1, createdAt: -1 });
    await db.collection("token_reports").createIndex({ chainId: 1, address: 1, expiresAt: 1 });
    indexesReady = true;
    log.info("db.indexes_ready", { collections: ["watchlists", "analysis_history", "token_reports"] });
  } catch (err) {
    log.error("db.index_failure", { collection: "watchlists", operation: "createIndex", error: safeErr(err) });
  }
}

export async function closeDb() {
  if (!client) return;
  await client.close().catch((err) => {
    log.warn("db.close_failure", { error: safeErr(err) });
  });
  client = null;
  db = null;
}
