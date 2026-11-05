/**
 * AI assistant ("Ask AI" in the app).
 *
 * The model works with audiTrack only through its own MCP server (loopback), using tool calling.
 * Read-only tools run directly; every tool that changes data waits for the user's approval.
 * Tool calling is implemented per provider with plain fetch (Anthropic, OpenAI, Azure OpenAI,
 * OpenRouter, Ollama). Conversations are kept in memory for an hour.
 */
import { randomUUID } from "node:crypto";
import { aiProvider, aiNotConfiguredMessage } from "./ai.js";
import { McpClient } from "./mcpClient.js";

const MAX_ROUNDS = 10;
const chats = new Map();

export class AssistantError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function systemPrompt() {
  return `You are the audiTrack assistant for an audit team. audiTrack tracks clients and their locations, controls (from a catalog, e.g. a CIS v8 baseline or ISO 27001 Annex A), findings (a control not met at a location), remediation plans that group findings, a solutions library and notes.
Today is ${new Date().toISOString().slice(0, 10)}.
- Use the tools to look things up; base facts only on tool results and say so when audiTrack has no answer.
- Look things up before you change them (ids, codes, current values).
- Changes are only carried out after the user approves them: propose them with the tools, the system asks for approval. After a change, confirm briefly what was done.
- Refer to controls by code and to plans by code (RP-xxx).
- Answer in the language of the user. Be concise and practical; use short lists where helpful.`;
}

/* ---------- provider adapters ---------- */
function textOf(v) {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map((p) => (typeof p === "string" ? p : typeof p?.text === "string" ? p.text : "")).join("");
  return "";
}

function safeJson(s) {
  try {
    return JSON.parse(s || "{}");
  } catch {
    return {};
  }
}

function openAiMessages(system, transcript) {
  const messages = [{ role: "system", content: system }];
  for (const m of transcript) {
    if (m.role === "user") messages.push({ role: "user", content: m.text });
    else if (m.role === "assistant")
      messages.push({
        role: "assistant",
        content: m.text || null,
        ...(m.calls.length ? { tool_calls: m.calls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.args) } })) } : {}),
      });
    else for (const r of m.results) messages.push({ role: "tool", tool_call_id: r.callId, content: r.content });
  }
  return messages;
}

const fnTools = (tools) => tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.inputSchema } }));

async function turn(p, system, transcript, tools) {
  const signal = AbortSignal.timeout(120_000);
  const fail = async (res) => new AssistantError(502, `${p.label} returned ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);

  if (p.id === "anthropic") {
    const messages = transcript.map((m) =>
      m.role === "user"
        ? { role: "user", content: m.text }
        : m.role === "assistant"
          ? { role: "assistant", content: [...(m.text ? [{ type: "text", text: m.text }] : []), ...m.calls.map((c) => ({ type: "tool_use", id: c.id, name: c.name, input: c.args }))] }
          : { role: "user", content: m.results.map((r) => ({ type: "tool_result", tool_use_id: r.callId, content: r.content, is_error: r.isError })) },
    );
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal,
      headers: { "x-api-key": p.key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: p.model, max_tokens: 8000, system, messages, tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema })) }),
    });
    if (!res.ok) throw await fail(res);
    const data = await res.json();
    if (data.stop_reason === "refusal") return { text: "The AI declined this request.", calls: [] };
    return {
      text: data.content.filter((b) => b.type === "text").map((b) => b.text).join(""),
      calls: data.content.filter((b) => b.type === "tool_use").map((b) => ({ id: b.id, name: b.name, args: b.input ?? {} })),
    };
  }

  if (p.id === "openai" || p.id === "openrouter" || p.id === "azure") {
    let url;
    let headers;
    let body = { messages: openAiMessages(system, transcript), tools: fnTools(tools) };
    if (p.id === "azure") {
      const endpoint = (process.env.AZURE_OPENAI_ENDPOINT || "").trim();
      if (endpoint.includes("/responses")) throw new AssistantError(409, "The assistant needs an Azure OpenAI chat completions endpoint, not the Responses API.");
      url = endpoint.includes("/deployments/") ? endpoint : `${endpoint.replace(/\/$/, "")}/openai/deployments/${p.model}/chat/completions?api-version=2024-08-01-preview`;
      headers = { "api-key": p.key, "content-type": "application/json" };
    } else {
      url = p.id === "openai" ? "https://api.openai.com/v1/chat/completions" : "https://openrouter.ai/api/v1/chat/completions";
      headers = { authorization: `Bearer ${p.key}`, "content-type": "application/json", ...(p.id === "openrouter" ? { "x-title": "audiTrack" } : {}) };
      body = { model: p.model, ...body };
    }
    const res = await fetch(url, { method: "POST", signal, headers, body: JSON.stringify(body) });
    if (!res.ok) throw await fail(res);
    const data = await res.json();
    const msg = data.choices?.[0]?.message;
    return {
      text: textOf(msg?.content),
      calls: (msg?.tool_calls ?? []).map((c) => ({ id: c.id, name: c.function.name, args: safeJson(c.function.arguments) })),
    };
  }

  // Ollama (needs a model with tool support)
  const messages = [{ role: "system", content: system }];
  for (const m of transcript) {
    if (m.role === "user") messages.push({ role: "user", content: m.text });
    else if (m.role === "assistant") messages.push({ role: "assistant", content: m.text, ...(m.calls.length ? { tool_calls: m.calls.map((c) => ({ function: { name: c.name, arguments: c.args } })) } : {}) });
    else for (const r of m.results) messages.push({ role: "tool", content: r.content, tool_name: r.name });
  }
  const res = await fetch(`${p.baseUrl}/api/chat`, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: p.model, stream: false, options: { num_ctx: 32768 }, messages, tools: fnTools(tools) }),
  });
  if (!res.ok) throw await fail(res);
  const data = await res.json();
  return {
    text: textOf(data.message?.content),
    calls: (data.message?.tool_calls ?? []).map((c) => ({ id: randomUUID(), name: c.function.name, args: typeof c.function.arguments === "string" ? safeJson(c.function.arguments) : c.function.arguments ?? {} })),
  };
}

/* ---------- the loop ---------- */
async function connect() {
  const mcp = McpClient.loopback("AI assistant");
  const { tools } = await mcp.initialize("auditrack-assistant");
  return { mcp, tools };
}

const isWrite = (tools, name) => !tools.find((t) => t.name === name)?.annotations?.readOnlyHint;
const toolTitle = (tools, name) => tools.find((t) => t.name === name)?.title ?? name;

async function execute(mcp, tools, calls, actions) {
  const results = [];
  for (const c of calls) {
    if (!tools.some((t) => t.name === c.name)) {
      results.push({ callId: c.id, name: c.name, content: `Tool ${c.name} does not exist.`, isError: true });
      continue;
    }
    const r = await mcp.callRaw(c.name, c.args).catch((e) => ({ text: e instanceof Error ? e.message : String(e), isError: true }));
    results.push({ callId: c.id, name: c.name, content: r.text.slice(0, 30_000), isError: r.isError });
    actions.push({ name: c.name, title: toolTitle(tools, c.name), write: isWrite(tools, c.name), ok: !r.isError });
  }
  return results;
}

/** Runs model turns until it answers, needs approval for a change, or hits the round limit. */
async function run(chat, mcp, tools, actions) {
  const p = aiProvider();
  if (!p) throw new AssistantError(409, aiNotConfiguredMessage());
  const system = systemPrompt();
  let reply = "";
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const t = await turn(p, system, chat.transcript, tools);
    if (!t.text && !t.calls.length) t.text = "…"; // an empty assistant message is not allowed in the next request
    chat.transcript.push({ role: "assistant", text: t.text, calls: t.calls });
    if (t.text) reply += (reply ? "\n\n" : "") + t.text;
    if (!t.calls.length) return { chatId: chat.id, reply, pending: [], actions };
    // Any change in this turn waits for approval (all calls of a turn are answered together).
    if (t.calls.some((c) => isWrite(tools, c.name))) {
      chat.pending = t.calls;
      return {
        chatId: chat.id,
        reply,
        actions,
        pending: t.calls.filter((c) => isWrite(tools, c.name)).map((c) => ({ id: c.id, name: c.name, title: toolTitle(tools, c.name), args: c.args })),
      };
    }
    chat.transcript.push({ role: "tool", results: await execute(mcp, tools, t.calls, actions) });
  }
  return { chatId: chat.id, reply: reply || "I could not finish this within the step limit. Please ask a more specific question.", pending: [], actions };
}

export function assistantConfig() {
  const p = aiProvider();
  return p ? { available: true, provider: p.label, model: p.model } : { available: false };
}

export async function chatMessage(input) {
  for (const [id, c] of chats) if (Date.now() - c.touchedAt > 3600_000) chats.delete(id);
  const message = String(input?.message ?? "").trim().slice(0, 8000);
  if (!message) throw new AssistantError(400, "Type a question.");
  if (!aiProvider()) throw new AssistantError(409, aiNotConfiguredMessage());
  let chat = input.chatId ? chats.get(input.chatId) : undefined;
  if (!chat) {
    chat = { id: randomUUID(), transcript: [], pending: [], touchedAt: Date.now() };
    chats.set(chat.id, chat);
  }
  if (chat.pending.length) throw new AssistantError(409, "Approve or decline the proposed change first.");
  chat.touchedAt = Date.now();
  chat.transcript.push({ role: "user", text: message });
  const { mcp, tools } = await connect();
  return run(chat, mcp, tools, []);
}

export async function chatDecision(input) {
  const chat = chats.get(String(input?.chatId));
  if (!chat) throw new AssistantError(404, "This conversation has expired. Start a new one.");
  if (!chat.pending.length) throw new AssistantError(409, "There is nothing to approve.");
  chat.touchedAt = Date.now();
  const { mcp, tools } = await connect();
  const calls = chat.pending;
  chat.pending = [];
  const actions = [];
  if (input.approve) {
    chat.transcript.push({ role: "tool", results: await execute(mcp, tools, calls, actions) });
  } else {
    // Read-only calls of the same turn still run; changes are reported as declined.
    const readResults = await execute(mcp, tools, calls.filter((c) => !isWrite(tools, c.name)), actions);
    const declined = calls
      .filter((c) => isWrite(tools, c.name))
      .map((c) => ({ callId: c.id, name: c.name, content: "The user declined this change. Do not retry it unless asked.", isError: true }));
    chat.transcript.push({ role: "tool", results: [...readResults, ...declined] });
  }
  return run(chat, mcp, tools, actions);
}
