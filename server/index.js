// audiTrack server: one Node process serves the web app (built SPA), the REST API under /api
// and the MCP server at /mcp. Data lives in the built-in database (or PostgreSQL via DATABASE_URL).
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import path from "node:path";
import { invoke } from "./router.js";
import "./routes/index.js";
import { describeDatabase, pool } from "./db.js";
import { initSchema } from "./schema.js";
import { aiProvider } from "./ai.js";
import { handleMcp, mcpTokenMode } from "./mcp.js";

const PORT = Number(process.env.PORT || 3000);
const STATIC_DIR = path.resolve(process.env.AUDITRACK_STATIC || "dist");
const MAX_BODY_BYTES = Number(process.env.AUDITRACK_MAX_BODY_MB || 100) * 1024 * 1024;
const AUTH_USER = process.env.AUDITRACK_USERNAME || "";
const AUTH_PASSWORD = process.env.AUDITRACK_PASSWORD || "";
export const LOGIN_ENABLED = !!(AUTH_USER || AUTH_PASSWORD);

// ---- Helpers ----
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("Request body too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function toHeaders(req) {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
  }
  return headers;
}

function safeEqual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// Optional login (HTTP Basic auth) when AUDITRACK_USERNAME / AUDITRACK_PASSWORD are set.
function isAuthorized(req) {
  if (!LOGIN_ENABLED) return true;
  const header = req.headers.authorization ?? "";
  if (!header.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const idx = decoded.indexOf(":");
  if (idx < 0) return false;
  return safeEqual(decoded.slice(0, idx), AUTH_USER) && safeEqual(decoded.slice(idx + 1), AUTH_PASSWORD);
}

// ---- API ----
async function handleApi(req, res, url, apiPath) {
  const method = req.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : await readBody(req);
  const result = await invoke(method, apiPath, { body, headers: toHeaders(req), url: url.href });
  const outHeaders = { ...(result.headers ?? {}) };
  let payload = result.body;
  if (result.jsonBody !== undefined) {
    payload = JSON.stringify(result.jsonBody);
    if (!Object.keys(outHeaders).some((h) => h.toLowerCase() === "content-type")) {
      outHeaders["Content-Type"] = "application/json; charset=utf-8";
    }
  }
  if (payload === undefined || payload === null || typeof payload === "string" || Buffer.isBuffer(payload)) {
    // send as-is
  } else if (payload instanceof ArrayBuffer) payload = Buffer.from(payload);
  else if (ArrayBuffer.isView(payload)) payload = Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength);
  else payload = String(payload);
  res.writeHead(result.status ?? 200, outHeaders);
  res.end(payload ?? undefined);
}

// ---- Web app (static SPA) ----
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".pdf": "application/pdf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};

async function serveFile(res, filePath, cacheControl) {
  const data = await readFile(filePath);
  res.writeHead(200, {
    "Content-Type": MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream",
    "Content-Length": data.length,
    "Cache-Control": cacheControl,
  });
  res.end(data);
}

async function handleStatic(req, res, url) {
  const rel = decodeURIComponent(url.pathname);
  const filePath = path.resolve(STATIC_DIR, "." + rel);
  if (filePath.startsWith(STATIC_DIR + path.sep)) {
    const info = await stat(filePath).catch(() => null);
    if (info?.isFile()) {
      const immutable = rel.startsWith("/assets/");
      return serveFile(res, filePath, immutable ? "public, max-age=31536000, immutable" : "no-cache");
    }
    // Missing files under /assets or /manual are real 404s, not app routes.
    if (rel.startsWith("/assets/") || rel.startsWith("/manual/")) {
      res.writeHead(404);
      return res.end("Not found");
    }
  }
  // Every other path is an app route: serve the SPA.
  const index = path.join(STATIC_DIR, "index.html");
  if (!(await stat(index).catch(() => null))) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Web app not built. Run `npm run build`, or use `npm run dev` during development.");
  }
  return serveFile(res, index, "no-cache");
}

// ---- Start ----
const client = await pool.connect();
try {
  await initSchema(client);
} finally {
  await client.release();
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    // MCP has its own Bearer token (see mcp.js), so it is not behind the Basic-auth login.
    if (url.pathname === "/mcp") {
      const body = req.method === "POST" ? await readBody(req) : Buffer.alloc(0);
      return await handleMcp(req, res, body);
    }
    const isPublic = url.pathname === "/api/health" || url.pathname.startsWith("/manual/");
    if (!isPublic && !isAuthorized(req)) {
      res.writeHead(401, { "WWW-Authenticate": 'Basic realm="audiTrack", charset="UTF-8"' });
      return res.end("Authentication required");
    }
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return await handleApi(req, res, url, url.pathname.replace(/^\/api\/?/, "").replace(/\/$/, ""));
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405);
      return res.end();
    }
    return await handleStatic(req, res, url);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) sendJson(res, error.status ?? 500, { ok: false, error: error.message });
    else res.end();
  }
});

server.listen(PORT, () => {
  const ai = aiProvider();
  console.log(`audiTrack listening on http://0.0.0.0:${PORT}`);
  console.log(`  database: ${describeDatabase()}`);
  console.log(`  login:    ${LOGIN_ENABLED ? "on (HTTP Basic auth)" : "off"}`);
  console.log(`  MCP:      /mcp (${mcpTokenMode()})`);
  console.log(`  AI:       ${ai ? `${ai.label} · ${ai.model}` : "not configured"}`);
});

// Close the database cleanly on stop, so the built-in database is never left half-written.
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    console.log(`audiTrack: ${signal} received, shutting down`);
    server.close();
    try {
      await pool.end();
    } catch (e) {
      console.error(e);
    }
    process.exit(0);
  });
}
