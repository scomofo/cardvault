import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { createTables } from "./schema.js";
import { createReferenceTables } from "./referenceSchema.js";
import { runMigrations, createIndexes } from "./migrations.js";

import { createPublishBatchTables } from "./services/batchPublish/schema.js";

let db = null;

function getDbPath() {
  return resolve(process.env.CARDVAULT_DB_PATH || "./data/cardvault.db");
}

export function initDB() {
  if (db) {
    db.close();
  }

  const resolvedDbPath = getDbPath();
  mkdirSync(dirname(resolvedDbPath), { recursive: true });
  db = new Database(resolvedDbPath);

  // Performance pragmas
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  createReferenceTables(db);
  createTables(db);
  createPublishBatchTables(db);
  runMigrations(db);
  createIndexes(db);
  return db;
}

export function getDB() {
  if (!db) throw new Error("Database not initialized — call initDB() first");
  return db;
}

export function run(sql, params = []) {
  return getDB().prepare(sql).run(...(Array.isArray(params) ? params : [params]));
}

export function get(sql, params = []) {
  return getDB().prepare(sql).get(...(Array.isArray(params) ? params : [params]));
}

export function all(sql, params = []) {
  return getDB().prepare(sql).all(...(Array.isArray(params) ? params : [params]));
}

export function runInImmediateTransaction(work) {
  const database = getDB();
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = work(database);
    database.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {
      // Ignore rollback failures so the original error is preserved.
    }
    throw error;
  }
}
