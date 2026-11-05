import { app } from "../router.js";
import { aiConfigured, aiNotConfiguredMessage, callChatCompletion } from "../ai.js";
import { loadAll } from "../internal.js";
import { McpClient } from "../mcpClient.js";

// "Translate all to English": reads the texts through the REST layer, translates them in batches
// and writes the changed texts back through audiTrack's own MCP server (tool update_texts).

const BATCH_SIZE = 15;

function extractJsonArray(raw) {
  let s = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) s = s.slice(start, end + 1);
  return JSON.parse(s);
}

async function batchTranslate(texts) {
  const content = await callChatCompletion([
    {
      role: "system",
      content:
        "You are a professional translator. Given a JSON array of strings, for each string: " +
        "if the text is NOT in English, translate it to English while preserving the original tone and register. " +
        "If the text IS already in English, or is empty, return it unchanged. Keep any HTML markup intact. " +
        "Respond ONLY with a valid JSON array of strings in exactly the same order as the input. No extra text.",
    },
    { role: "user", content: JSON.stringify(texts) },
  ], 3000);
  try {
    const out = extractJsonArray(content);
    // A batch that does not line up with its input is ignored, so no text lands in the wrong field.
    return Array.isArray(out) && out.length === texts.length ? out.map((t, i) => (typeof t === "string" ? t : texts[i])) : texts;
  } catch {
    return texts;
  }
}

app.http("translateAll", {
  methods: ["POST"],
  route: "translate-all",
  handler: async (request, context) => {
    try {
      if (!aiConfigured()) return { status: 500, jsonBody: { ok: false, error: aiNotConfiguredMessage() } };

      const d = await loadAll();
      const items = [];
      const push = (table, id, field, text) => {
        if (typeof text === "string" && text.trim()) items.push({ table, id, field, text });
      };
      d.notes.forEach((r) => { push("notes", r.id, "title", r.title); push("notes", r.id, "body", r.body); });
      d.findings.forEach((r) => { push("findings", r.id, "title", r.title); push("findings", r.id, "description", r.description); });
      d.control_catalog.forEach((r) => { push("control_catalog", r.id, "name", r.name); push("control_catalog", r.id, "description", r.description); });
      d.controls.forEach((r) => { push("controls", r.id, "name", r.name); push("controls", r.id, "implementation_notes", r.implementation_notes); });
      d.remediation_plans.forEach((r) => { push("remediation_plans", r.id, "title", r.title); push("remediation_plans", r.id, "description", r.description); });
      d.solutions.forEach((r) => { push("solutions", r.id, "title", r.title); push("solutions", r.id, "body", r.body); });
      d.comments.forEach((r) => { push("comments", r.id, "body", r.body); });
      if (!items.length) return { status: 200, jsonBody: { ok: true, translated: 0 } };

      const batches = [];
      for (let i = 0; i < items.length; i += BATCH_SIZE) batches.push(items.slice(i, i + BATCH_SIZE));
      const results = await Promise.all(batches.map((b) => batchTranslate(b.map((it) => it.text))));
      const updates = batches
        .flatMap((b, bi) => b.map((it, i) => ({ table: it.table, id: it.id, field: it.field, text: results[bi][i], original: it.text })))
        .filter((u) => u.text && u.text !== u.original)
        .map(({ original: _o, ...u }) => u);

      if (updates.length) {
        const mcp = McpClient.loopback("Translate all");
        await mcp.initialize("auditrack-translate");
        await mcp.call("update_texts", { items: updates });
      }
      return { status: 200, jsonBody: { ok: true, translated: updates.length } };
    } catch (error) {
      context.error(error);
      return { status: 500, jsonBody: { ok: false, error: error.message } };
    }
  },
});
