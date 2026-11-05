import { app } from "../router.js";
import { aiConfigured, aiNotConfiguredMessage, callChatCompletion } from "../ai.js";
import { McpClient } from "../mcpClient.js";

// "Rant mode" of Ask AI: turns a free-text report into suggested findings and remediations.
// The clients, locations and controls to map onto are read through audiTrack's own MCP server
// (loopback); the suggestions are only saved when the user creates them in the app.
// The question mode is the MCP-based assistant (routes/assistant.js).

async function buildRantContext() {
  const mcp = McpClient.loopback("AI analysis");
  await mcp.initialize("auditrack-analysis");
  const [clients, controls] = await Promise.all([mcp.call("list_clients"), mcp.call("list_controls")]);
  let ctx = "=== AVAILABLE ITEMS FOR MAPPING ===\n\n## Clients and locations\n";
  for (const c of clients) {
    ctx += `- Client: ${c.name}\n`;
    for (const l of c.locations) ctx += `  - Location ID: ${l.id} | Name: ${l.name}\n`;
  }
  ctx += "\n## Controls (map findings to the most relevant control_id)\n";
  for (const c of controls) {
    if (!c.id) continue;
    ctx += `- ID: ${c.id} | ${c.code ? `[${c.code}] ` : ""}${c.name}${c.appliesTo === "all locations" ? " (all locations)" : ""}\n`;
  }
  return ctx;
}

function extractJson(text) {
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1) return JSON.parse(cleaned.slice(start, end + 1));
  return JSON.parse(cleaned);
}

app.http("askAi", {
  methods: ["POST"],
  route: "ask-ai",
  handler: async (request, context) => {
    try {
      const { mode, rant } = await request.json();
      if (mode !== "rant") return { status: 400, jsonBody: { ok: false, error: "Use /api/assistant/message for questions." } };
      if (!aiConfigured()) return { status: 500, jsonBody: { ok: false, error: aiNotConfiguredMessage() } };
      if (!String(rant ?? "").trim()) return { status: 400, jsonBody: { ok: false, error: "Paste or type a report first." } };

      const systemMessage = {
        role: "system",
        content: `You are a security audit assistant. Analyze the following report or story and identify security findings and appropriate remediations.

For each finding:
- Give a clear, concise title and description
- Assign severity: low, medium, high, or critical
- Map to the most relevant control_id from the list below (copy the exact UUID, or use null if no match)
- Map to the most relevant location_id if the location can be inferred from context (copy the exact UUID, or use null)

For each remediation:
- Give a clear title and description
- List concrete step-by-step actions
- Estimate effort in working days (number, or null if unknown)
- Reference related finding titles

Return ONLY valid JSON (no markdown, no explanation) in exactly this format:
{
  "summary": "Brief overview of analysis",
  "findings": [
    { "title": "string", "description": "string", "severity": "low|medium|high|critical", "control_id": "uuid or null", "location_id": "uuid or null" }
  ],
  "remediations": [
    { "title": "string", "description": "string", "effort_days": number_or_null, "steps": ["step 1", "step 2"], "related_finding_titles": ["finding title"] }
  ]
}

${await buildRantContext()}`,
      };
      const aiReply = await callChatCompletion([systemMessage, { role: "user", content: String(rant) }], null);
      let suggestions;
      try {
        suggestions = extractJson(aiReply);
      } catch {
        context.error("Failed to parse rant JSON:", aiReply);
        return { status: 200, jsonBody: { ok: true, reply: aiReply, suggestions: null } };
      }
      return { status: 200, jsonBody: { ok: true, reply: suggestions.summary ?? "", suggestions } };
    } catch (error) {
      context.error(error);
      return { status: 500, jsonBody: { ok: false, error: error.message } };
    }
  },
});
