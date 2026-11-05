import { app } from "../router.js";
import { deleteAllFiles } from "../storage.js";
import { aiConfigured, aiProvider, callChatCompletion } from "../ai.js";
import { BASELINE_SETS, CONTROL_SETS, FRAMEWORKS, SOLUTION_TEMPLATES, frameworkControls, templateControlsByCode } from "../setup/templates.js";
import { applyPlan, normalizePlan, textToHtml } from "../setup/apply.js";
import { loadDemo } from "../setup/demo.js";
import { McpClient } from "../mcpClient.js";

import { pool } from "../db.js";

// First setup (/setup in the UI):
//   GET  setup            status: completed?, empty?, counts, AI available?
//   GET  setup/templates  control sets and solution templates for the wizard
//   POST setup/apply      apply a reviewed plan (wizard or AI proposal)
//   POST setup/ai         ask the AI for a proposal — saves nothing
//   POST setup/demo       load the fictional demo data (empty database only)
//   POST setup/complete   mark setup as done (or skipped)
//   POST setup/reset      delete ALL data and show the setup again ({ confirm: "DELETE" })

const DATA_TABLES = [
  "solution_remediations", "solution_controls", "remediation_plan_findings", "comments", "attachments",
  "control_requirements", "requirement_sources", "findings", "remediation_plans", "control_locations",
  "controls", "control_catalog", "locations", "clients", "notes", "solutions",
];
const COUNTED = ["clients", "locations", "control_catalog", "findings", "remediation_plans", "solutions", "notes"];

const aiAvailable = () => aiConfigured();

async function getCounts(db) {
  const counts = {};
  for (const t of COUNTED) counts[t] = Number((await db.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n);
  return counts;
}

async function getMeta(db, key) {
  return (await db.query("SELECT value FROM app_meta WHERE key = $1", [key])).rows[0]?.value ?? null;
}

async function setMeta(db, key, value) {
  await db.query(
    "INSERT INTO app_meta (key, value, updated_at) VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()",
    [key, value]
  );
}

async function transaction(db, fn) {
  await db.query("BEGIN");
  try {
    const result = await fn();
    await db.query("COMMIT");
    return result;
  } catch (e) {
    await db.query("ROLLBACK").catch(() => {});
    throw e;
  }
}

async function status(db) {
  const counts = await getCounts(db);
  const empty = Object.values(counts).every((n) => n === 0);
  let completedAt = await getMeta(db, "setup_completed_at");
  // Databases that already hold data (created before this wizard existed) never see the setup.
  if (!completedAt && !empty) {
    completedAt = new Date().toISOString();
    await setMeta(db, "setup_completed_at", completedAt);
  }
  const p = aiProvider();
  return { completed: !!completedAt, completedAt, empty, counts, aiAvailable: !!p, aiProvider: p ? `${p.label} · ${p.model}` : null };
}

function extractJson(text) {
  const cleaned = text.replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The AI did not return a usable proposal. Try again or rephrase.");
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function aiProposal(description) {
  const baseline = BASELINE_SETS.flatMap((s) =>
    s.controls.map((c) => `${c.code} | ${s.name} | ${c.name}${c.essential ? " | essential" : ""}`)
  ).join("\n");
  const frameworks = FRAMEWORKS.map((f) => `${f.id} | ${f.name} | ${f.description}`).join("\n");
  const templateSolutions = SOLUTION_TEMPLATES.map((s) => `${s.code} | ${s.title} | controls: ${s.controls.join(", ")}`).join("\n");
  const system = {
    role: "system",
    content: `You help set up audiTrack, an audit findings tracker for audit teams that audit several clients.
Data model: clients have locations (sites, departments, business units or environments). Controls come from a reusable catalog. Solutions are reusable remediation guidance linked to controls.

Based on the user's description, propose a starting configuration. Prefer template items; add custom controls/solutions only for needs the templates do not cover.

Recommended baseline controls, based on CIS Controls v8 and grouped by NIST CSF 2.0 function (code | function | name | essential?).
Always include the essential ones unless the user clearly does not need them; add others that fit the user's focus:
${baseline}

Frameworks that can be added as a complete set (id | name | description). Add a framework only when the user audits against it
(e.g. mentions ISO 27001, ISO certification or Annex A); it can be combined with baseline controls:
${frameworks}

Template solutions (code | title | linked controls):
${templateSolutions}

Answer with ONLY a JSON object, no other text:
{
  "summary": "2-3 sentences explaining the proposal",
  "clients": [{ "name": "...", "description": "...", "locations": ["..."] }],
  "template_controls": ["GV-01", "..."],
  "frameworks": ["iso27001-2022"],
  "custom_controls": [{ "code": "CUS-01", "name": "...", "description": "what good looks like, 1-3 sentences" }],
  "template_solutions": ["SOL-..."],
  "custom_solutions": [{ "title": "...", "body": "plain text, paragraphs separated by blank lines, '- ' for bullets", "tags": ["..."], "controls": ["control codes"] }]
}
Only include clients and locations the user mentions or clearly implies; never invent real company names. Use the user's language for names and descriptions.`,
  };
  const answer = await callChatCompletion([system, { role: "user", content: description }], null);
  const raw = extractJson(answer);

  const byCode = templateControlsByCode();
  const controls = [];
  const addTemplate = (code) => {
    const c = byCode.get(String(code).trim().toUpperCase());
    if (c && !controls.some((x) => x.code === c.code)) controls.push({ ...c, source: "template" });
  };
  for (const code of Array.isArray(raw.template_controls) ? raw.template_controls : []) addTemplate(code);
  for (const id of Array.isArray(raw.frameworks) ? raw.frameworks : []) {
    for (const c of frameworkControls(String(id).trim().toLowerCase())) addTemplate(c.code);
  }
  for (const c of Array.isArray(raw.custom_controls) ? raw.custom_controls : []) controls.push({ ...c, source: "ai" });

  const solutions = [];
  for (const code of Array.isArray(raw.template_solutions) ? raw.template_solutions : []) {
    const s = SOLUTION_TEMPLATES.find((x) => x.code === String(code).trim().toUpperCase());
    if (s && !solutions.some((x) => x.code === s.code)) solutions.push({ ...s, source: "template" });
  }
  for (const s of Array.isArray(raw.custom_solutions) ? raw.custom_solutions : []) {
    solutions.push({ ...s, body: textToHtml(String(s?.body ?? "")), source: "ai" });
  }

  const plan = normalizePlan({ clients: raw.clients, controls, solutions });
  return { summary: typeof raw.summary === "string" ? raw.summary.slice(0, 2000) : "", plan };
}

app.http("setup", {
  methods: ["GET", "POST"],
  route: "setup/{action?}",
  handler: async (request, context) => {
    const db = await pool.connect();
    try {
      const action = request.params.action ?? "";
      const method = request.method;

      if (method === "GET" && !action) {
        return { status: 200, jsonBody: { ok: true, data: await status(db) } };
      }

      if (method === "GET" && action === "templates") {
        return { status: 200, jsonBody: { ok: true, data: { controlSets: CONTROL_SETS, frameworks: FRAMEWORKS, solutions: SOLUTION_TEMPLATES } } };
      }

      if (method === "POST" && action === "apply") {
        const plan = normalizePlan(await request.json());
        const counts = await transaction(db, () => applyPlan(db, plan));
        return { status: 200, jsonBody: { ok: true, data: counts } };
      }

      // A reviewed AI proposal is saved through audiTrack's own MCP server (tool apply_setup).
      if (method === "POST" && action === "apply-ai") {
        const plan = normalizePlan(await request.json());
        const mcp = McpClient.loopback("AI setup");
        await mcp.initialize("auditrack-ai-setup");
        const counts = await mcp.call("apply_setup", plan);
        return { status: 200, jsonBody: { ok: true, data: counts } };
      }

      if (method === "POST" && action === "ai") {
        if (!aiAvailable()) return { status: 400, jsonBody: { ok: false, error: "AI is not configured on the server." } };
        const body = await request.json().catch(() => ({}));
        const description = typeof body.description === "string" ? body.description.trim().slice(0, 8000) : "";
        if (description.length < 20) return { status: 400, jsonBody: { ok: false, error: "Describe your audit work in a few sentences first." } };
        return { status: 200, jsonBody: { ok: true, data: await aiProposal(description) } };
      }

      if (method === "POST" && action === "demo") {
        const counts = await transaction(db, async () => {
          const current = await getCounts(db);
          if (Object.values(current).some((n) => n > 0)) {
            throw Object.assign(new Error("Demo data can only be loaded into an empty database."), { status: 409 });
          }
          const result = await loadDemo(db);
          await setMeta(db, "setup_completed_at", new Date().toISOString());
          await setMeta(db, "demo_loaded_at", new Date().toISOString());
          return result;
        });
        return { status: 200, jsonBody: { ok: true, data: counts } };
      }

      if (method === "POST" && action === "complete") {
        const body = await request.json().catch(() => ({}));
        await setMeta(db, "setup_completed_at", new Date().toISOString());
        if (body.skipped) await setMeta(db, "setup_skipped", "true");
        return { status: 200, jsonBody: { ok: true } };
      }

      if (method === "POST" && action === "reset") {
        const body = await request.json().catch(() => ({}));
        if (body.confirm !== "DELETE") return { status: 400, jsonBody: { ok: false, error: 'Type DELETE to confirm.' } };
        await transaction(db, async () => {
          await db.query(`TRUNCATE ${DATA_TABLES.join(", ")} CASCADE`);
          await db.query("DELETE FROM app_meta WHERE key IN ('setup_completed_at', 'setup_skipped', 'demo_loaded_at')");
        });
        await deleteAllFiles();
        context.log("setup/reset: all data deleted");
        return { status: 200, jsonBody: { ok: true } };
      }

      return { status: 400, jsonBody: { ok: false, error: "Bad request" } };
    } catch (error) {
      context.error(error);
      return { status: error.status ?? 500, jsonBody: { ok: false, error: error.message } };
    } finally {
      db.release();
    }
  },
});
