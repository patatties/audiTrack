// The database. One shared pool for all routes, with the pg API: pool.connect() -> client,
// client.query(sql, params) -> { rows, rowCount }, client.release().
//
// - DATABASE_URL empty (default): built-in PostgreSQL (PGlite) stored in AUDITRACK_DATA_DIR/pgdata.
//   No database server needed, comparable to n8n's default SQLite.
// - DATABASE_URL set: an external PostgreSQL server through the pg driver.
//   SSL follows the URL, e.g. ?sslmode=require, ?sslmode=no-verify (self-signed) or ?sslmode=disable.
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";
import path from "node:path";

export const DATA_DIR = path.resolve(process.env.AUDITRACK_DATA_DIR || "./data");
export const usesExternalDatabase = !!process.env.DATABASE_URL;

// ---- Built-in database (one instance per process) ----
let dbPromise = null;
function getLocalDb() {
  dbPromise ??= PGlite.create({
    dataDir: path.join(DATA_DIR, "pgdata"),
    // Match the pg driver: bigint and numeric come back as strings.
    parsers: { 20: (v) => v, 1700: (v) => v },
  });
  return dbPromise;
}

// PGlite has one connection. A client that opened a transaction keeps exclusive access
// until COMMIT/ROLLBACK/release; other statements run one at a time in between.
let owner = null;
let depth = 0;
const waiters = [];

async function acquire(client) {
  while (owner !== null && owner !== client) await new Promise((r) => waiters.push(r));
  owner = client;
  depth++;
}

function releaseLock(client, force = false) {
  if (owner !== client) return;
  depth = force ? 0 : Math.max(0, depth - 1);
  if (depth === 0 && !client.inTransaction) {
    owner = null;
    waiters.splice(0).forEach((r) => r());
  }
}

class LocalClient {
  inTransaction = false;

  async query(text, values) {
    if (typeof text === "object" && text !== null) {
      values = text.values;
      text = text.text;
    }
    const head = text.trim().slice(0, 20).toUpperCase();
    await acquire(this);
    try {
      if (/^(BEGIN|START TRANSACTION)\b/.test(head)) this.inTransaction = true;
      const db = await getLocalDb();
      let res;
      if (values && values.length) {
        res = await db.query(text, values);
      } else {
        // exec() allows several statements in one string (schema.js); return the last result.
        const results = await db.exec(text);
        res = results[results.length - 1] ?? { rows: [], fields: [] };
      }
      return { rows: res.rows, rowCount: res.affectedRows ?? res.rows.length, fields: res.fields };
    } finally {
      if (/^(COMMIT|ROLLBACK|END)\b/.test(head)) this.inTransaction = false;
      releaseLock(this);
    }
  }

  async release() {
    // A transaction left open must not leak into the next request.
    if (this.inTransaction) await this.query("ROLLBACK").catch(() => {});
    releaseLock(this, true);
  }
}

class LocalPool {
  async connect() {
    return new LocalClient();
  }
  async query(text, values) {
    const client = new LocalClient();
    try {
      return await client.query(text, values);
    } finally {
      await client.release();
    }
  }
  async end() {
    if (dbPromise) await (await dbPromise).close();
  }
}

export const pool = usesExternalDatabase
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL })
  : new LocalPool();

export function describeDatabase() {
  if (!usesExternalDatabase) return `built-in PostgreSQL in ${path.join(DATA_DIR, "pgdata")}`;
  try {
    const u = new URL(process.env.DATABASE_URL);
    return `PostgreSQL at ${u.hostname}${u.port ? `:${u.port}` : ""}${u.pathname}`;
  } catch {
    return "PostgreSQL (DATABASE_URL)";
  }
}
