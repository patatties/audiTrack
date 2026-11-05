// Minimal MCP client (Streamable HTTP, JSON responses) used by audiTrack to talk to its own MCP
// server over loopback. The AI features (assistant, analysis, translation, AI setup) read and change
// data only through it, so every AI action uses the same tools any external MCP client gets.
import { MCP_TOKEN, VERSION } from "./mcp.js";

const PROTOCOL_VERSION = "2025-06-18";

export class McpCallError extends Error {}

export class McpClient {
  constructor(url, actor, token = MCP_TOKEN) {
    this.url = url;
    this.actor = actor;
    this.token = token;
    this.nextId = 1;
    this.protocolVersion = PROTOCOL_VERSION;
  }

  /** Loopback client for this server's own /mcp endpoint. */
  static loopback(actor) {
    return new McpClient(`http://127.0.0.1:${process.env.PORT || 3000}/mcp`, actor);
  }

  async rpc(method, params, notification = false) {
    const msg = { jsonrpc: "2.0", method, ...(params === undefined ? {} : { params }), ...(notification ? {} : { id: this.nextId++ }) };
    const res = await fetch(this.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": this.protocolVersion,
        "x-auditrack-actor": encodeURIComponent(this.actor),
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify(msg),
      signal: AbortSignal.timeout(60_000),
    });
    if (notification) {
      if (res.status !== 202 && !res.ok) throw new McpCallError(`MCP ${method} failed with HTTP ${res.status}`);
      return null;
    }
    if (!res.ok) throw new McpCallError(`MCP ${method} failed with HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    if (body.error) throw new McpCallError(`MCP ${method} error ${body.error.code}: ${body.error.message}`);
    return body.result;
  }

  /** Handshake; returns the server info and the tool list. */
  async initialize(clientName = "auditrack-ai") {
    const init = await this.rpc("initialize", { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: clientName, version: VERSION } });
    this.protocolVersion = init.protocolVersion;
    await this.rpc("notifications/initialized", undefined, true);
    const list = await this.rpc("tools/list");
    return { serverInfo: init.serverInfo, tools: list.tools };
  }

  /** Calls a tool and returns its text output and error flag, as a model should see it. */
  async callRaw(name, args = {}) {
    const result = await this.rpc("tools/call", { name, arguments: args });
    return { text: result.content.filter((c) => c.type === "text").map((c) => c.text).join(""), isError: !!result.isError };
  }

  /** Calls a tool and returns its JSON output; a tool error becomes an exception. */
  async call(name, args = {}) {
    const { text, isError } = await this.callRaw(name, args);
    if (isError) throw new McpCallError(`${name}: ${text}`);
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
}
