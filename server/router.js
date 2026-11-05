// Route registry for the API. Each file in routes/ registers its endpoints with
// app.http(name, { methods, route, handler }). Both the HTTP server (index.js) and the MCP tools
// (internal.js -> mcp.js) call the handlers through invoke(), so they share the same logic.
//
// A handler receives (request, context) and returns { status, jsonBody | body, headers }.
//   request: { method, url, headers, query, params, json(), text(), arrayBuffer() }
//   context: { log, warn, error }

export const routes = [];

export const app = {
  http(name, options) {
    const names = [];
    // "clients/{id?}" -> ^clients(?:/([^/]+))?$ ; "attachment-download/{id}" -> ^attachment-download/([^/]+)$
    const pattern = options.route
      .split("/")
      .map((seg, i) => {
        const m = seg.match(/^\{(\w+)(\?)?\}$/);
        const sep = i === 0 ? "" : "/";
        if (!m) return sep + seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        names.push(m[1]);
        return m[2] ? `(?:${sep}([^/]+))?` : `${sep}([^/]+)`;
      })
      .join("");
    routes.push({
      name,
      handler: options.handler,
      regex: new RegExp(`^${pattern}$`, "i"),
      names,
      methods: (options.methods ?? ["GET"]).map((m) => m.toUpperCase()),
    });
  },
};

function makeContext(name) {
  const log = (...args) => console.log(`[${name}]`, ...args);
  return {
    log,
    info: log,
    warn: (...args) => console.warn(`[${name}]`, ...args),
    error: (...args) => console.error(`[${name}]`, ...args),
  };
}

/**
 * Runs the handler for METHOD /api/<apiPath>.
 * body: Buffer (raw request body) or any JSON value. Returns the handler result
 * ({ status, jsonBody | body, headers }), or a 404/405 result when no route matches.
 */
export async function invoke(method, apiPath, { body, headers = new Headers(), url = `http://localhost/api/${apiPath}` } = {}) {
  method = method.toUpperCase();
  const path = apiPath.replace(/^\/+|\/+$/g, "");
  const raw = body === undefined ? Buffer.alloc(0) : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  let pathMatched = false;
  for (const route of routes) {
    const m = path.match(route.regex);
    if (!m) continue;
    pathMatched = true;
    if (!route.methods.includes(method)) continue;
    const params = {};
    route.names.forEach((n, i) => {
      if (m[i + 1] !== undefined) params[n] = decodeURIComponent(m[i + 1]);
    });
    const request = {
      method,
      url,
      headers,
      query: new URL(url).searchParams,
      params,
      text: async () => raw.toString("utf8"),
      json: async () => JSON.parse(raw.toString("utf8")),
      arrayBuffer: async () => raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
    };
    return (await route.handler(request, makeContext(route.name))) ?? {};
  }
  return pathMatched
    ? { status: 405, jsonBody: { ok: false, error: "Method not allowed" } }
    : { status: 404, jsonBody: { ok: false, error: "Not found" } };
}
