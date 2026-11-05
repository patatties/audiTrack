/**
 * audiTrack MCP server (Model Context Protocol) at /mcp, "Streamable HTTP" transport.
 *
 * Stateless JSON-RPC over HTTP POST; responses are plain JSON (no SSE stream, GET returns 405).
 * Tools call the same REST handlers as the web app (internal.js), so every read and change
 * follows the same rules. The built-in AI assistant uses these tools too (assistant.js).
 *
 * Security: if AUDITRACK_MCP_TOKEN is set, every request must send "Authorization: Bearer <token>".
 * Without it there is no check, unless the web app login is on: then a random internal token is used
 * and only audiTrack itself can use MCP (set AUDITRACK_MCP_TOKEN to allow external clients).
 * Browser requests from other origins are always refused.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { callApi, loadAll } from "./internal.js";
import { BASELINE_SETS, FRAMEWORKS, frameworkControls, templateControlsByCode } from "./setup/templates.js";

export const VERSION = process.env.AUDITRACK_VERSION || "latest";
const ENV_TOKEN = process.env.AUDITRACK_MCP_TOKEN || "";
const LOGIN = !!(process.env.AUDITRACK_USERNAME || process.env.AUDITRACK_PASSWORD);
/** Token the loopback client sends; random per start when only the internal assistant may use MCP. */
export const MCP_TOKEN = ENV_TOKEN || (LOGIN ? randomBytes(32).toString("hex") : "");
const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

export function mcpTokenMode() {
  if (ENV_TOKEN) return "token required";
  if (LOGIN) return "internal use only; set AUDITRACK_MCP_TOKEN for external MCP clients";
  return "no token";
}

class ToolError extends Error {}

/* ---------- helpers on the bootstrap data ---------- */
const lc = (v) => String(v ?? "").trim().toLowerCase();
const day = (v) => (v ? new Date(v).toISOString().slice(0, 10) : null);
const today = () => new Date().toISOString().slice(0, 10);
const excerpt = (v, n = 200) => {
  const t = String(v ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};
const SEVERITIES = ["low", "medium", "high", "critical"];
const STATUSES = ["todo", "in_progress", "gathering_evidence", "done"];

function lookups(d) {
  const clientById = new Map(d.clients.map((c) => [c.id, c]));
  const locationById = new Map(d.locations.map((l) => [l.id, l]));
  const catalogById = new Map(d.control_catalog.map((c) => [c.id, c]));
  const controlById = new Map(d.controls.map((c) => [c.id, c]));
  const planById = new Map(d.remediation_plans.map((p) => [p.id, p]));
  const controlCode = (id) => {
    const c = controlById.get(id);
    return c ? catalogById.get(c.catalog_id)?.code ?? null : null;
  };
  const place = (locationId) => {
    const l = locationById.get(locationId);
    return { client: l ? clientById.get(l.client_id)?.name ?? null : null, location: l?.name ?? null };
  };
  const plansOf = (findingId) =>
    d.remediation_plan_findings.filter((x) => x.finding_id === findingId).map((x) => planById.get(x.plan_id)?.code ?? x.plan_id);
  const findingSummary = (f) => ({
    id: f.id,
    title: f.title,
    severity: f.severity,
    status: f.status,
    ...place(f.location_id),
    control: controlCode(f.control_id) ?? controlById.get(f.control_id)?.name ?? null,
    assignee: f.assignee ?? null,
    due_date: day(f.due_date),
    overdue: !!f.due_date && f.status !== "done" && day(f.due_date) < today(),
    plans: plansOf(f.id),
  });
  return { clientById, locationById, catalogById, controlById, planById, controlCode, place, findingSummary };
}

function resolveControl(d, ref) {
  const r = lc(ref);
  const byId = d.controls.find((c) => c.id === ref);
  if (byId) return byId;
  const cat = d.control_catalog.find((c) => lc(c.code) === r) ?? d.control_catalog.find((c) => lc(c.name) === r);
  const ctl = cat ? d.controls.find((c) => c.catalog_id === cat.id) : d.controls.find((c) => lc(c.name) === r);
  if (!ctl) throw new ToolError(`No control "${ref}". Use list_controls to see codes.`);
  return ctl;
}

function resolveLocation(d, ref, clientRef) {
  const byId = d.locations.find((l) => l.id === ref);
  if (byId) return byId;
  let clientName = clientRef;
  let locName = ref;
  if (!clientName && String(ref).includes("/")) [clientName, locName] = String(ref).split("/").map((s) => s.trim());
  const clients = clientName ? d.clients.filter((c) => lc(c.name) === lc(clientName) || c.id === clientName) : d.clients;
  const hits = d.locations.filter((l) => lc(l.name) === lc(locName) && clients.some((c) => c.id === l.client_id));
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) throw new ToolError(`Location "${ref}" exists for several clients; give the client too ("Client / Location").`);
  throw new ToolError(`No location "${ref}"${clientName ? ` for client "${clientName}"` : ""}. Use list_clients to see locations.`);
}

function resolvePlan(d, ref) {
  const p = d.remediation_plans.find((x) => x.id === ref || lc(x.code) === lc(ref));
  if (!p) throw new ToolError(`No remediation plan "${ref}". Use list_remediation_plans.`);
  return p;
}

function resolveFinding(d, ref) {
  const f = d.findings.find((x) => x.id === ref) ?? d.findings.filter((x) => lc(x.title) === lc(ref))[0];
  if (!f) throw new ToolError(`No finding "${ref}". Use list_findings to find its id.`);
  return f;
}

function pickFields(a, allowed) {
  const out = {};
  for (const k of allowed) if (a[k] !== undefined && a[k] !== null && a[k] !== "") out[k] = a[k];
  if (out.severity && !SEVERITIES.includes(out.severity)) throw new ToolError(`severity must be one of ${SEVERITIES.join(", ")}`);
  if (out.status && !STATUSES.includes(out.status)) throw new ToolError(`status must be one of ${STATUSES.join(", ")}`);
  if (out.due_date && !/^\d{4}-\d{2}-\d{2}$/.test(String(out.due_date))) throw new ToolError("due_date must be YYYY-MM-DD");
  return out;
}

function nextPlanCode(d) {
  let max = 0;
  for (const p of d.remediation_plans) {
    const m = String(p.code ?? "").match(/^RP-(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `RP-${String(max + 1).padStart(3, "0")}`;
}

/* ---------- tools ---------- */
const str = (description, extra = {}) => ({ type: "string", description, ...extra });
const num = (description, extra = {}) => ({ type: "number", description, ...extra });
const int = (description, extra = {}) => ({ type: "integer", description, ...extra });
const strList = (description) => ({ type: "array", items: { type: "string" }, description });
const obj = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: false });

const TOOLS = [
  /* ---- read ---- */
  {
    name: "get_overview",
    title: "Audit overview",
    description: "Key figures: findings by status and severity, open critical/high, overdue findings, remediation plans by status, and per-client progress.",
    readOnly: true,
    inputSchema: obj({}),
    run: async () => {
      const d = await loadAll();
      const L = lookups(d);
      const open = d.findings.filter((f) => f.status !== "done");
      const count = (list, key) => Object.fromEntries([...new Set(list.map((x) => x[key]))].map((v) => [v, list.filter((x) => x[key] === v).length]));
      return {
        clients: d.clients.length,
        locations: d.locations.length,
        controls: d.controls.length,
        findings: { total: d.findings.length, byStatus: count(d.findings, "status"), openBySeverity: count(open, "severity") },
        overdueFindings: open.filter((f) => f.due_date && day(f.due_date) < today()).map(L.findingSummary),
        remediationPlans: { total: d.remediation_plans.length, byStatus: count(d.remediation_plans, "status") },
        perClient: d.clients.map((c) => {
          const fs = d.findings.filter((f) => L.locationById.get(f.location_id)?.client_id === c.id);
          return { client: c.name, findings: fs.length, done: fs.filter((f) => f.status === "done").length, openCritical: fs.filter((f) => f.status !== "done" && f.severity === "critical").length };
        }),
      };
    },
  },
  {
    name: "list_clients",
    title: "List clients",
    description: "All clients with their locations (sites, departments, business units or environments).",
    readOnly: true,
    inputSchema: obj({}),
    run: async () => {
      const d = await loadAll();
      return d.clients.map((c) => ({ id: c.id, name: c.name, description: c.description, locations: d.locations.filter((l) => l.client_id === c.id).map((l) => ({ id: l.id, name: l.name })) }));
    },
  },
  {
    name: "list_controls",
    title: "List controls",
    description: "Controls in the catalog with code, where they apply and how many findings are open.",
    readOnly: true,
    inputSchema: obj({ search: str("Text to search in code and name") }),
    run: async (a) => {
      const d = await loadAll();
      const L = lookups(d);
      const q = lc(a.search);
      return d.control_catalog
        .map((cat) => ({ cat, ctl: d.controls.find((c) => c.catalog_id === cat.id) }))
        .filter(({ cat }) => !q || lc(`${cat.code} ${cat.name}`).includes(q))
        .map(({ cat, ctl }) => ({
          id: ctl?.id ?? null,
          code: cat.code,
          name: cat.name,
          appliesTo: ctl?.applies_to_all ? "all locations" : d.control_locations.filter((x) => x.control_id === ctl?.id).map((x) => Object.values(L.place(x.location_id)).join(" / ")),
          openFindings: ctl ? d.findings.filter((f) => f.control_id === ctl.id && f.status !== "done").length : 0,
        }));
    },
  },
  {
    name: "get_control",
    title: "Get control",
    description: "Full details of one control: description, implementation notes, requirements and their sources, linked solutions and findings.",
    readOnly: true,
    inputSchema: obj({ control: str("Control code (e.g. PR-02, A.8.5), name or id") }, ["control"]),
    run: async (a) => {
      const d = await loadAll();
      const L = lookups(d);
      const ctl = resolveControl(d, a.control);
      const cat = L.catalogById.get(ctl.catalog_id);
      const solutionIds = d.solution_controls.filter((x) => x.control_id === ctl.id).map((x) => x.solution_id);
      return {
        id: ctl.id,
        code: cat?.code ?? null,
        name: cat?.name ?? ctl.name,
        description: cat?.description ?? null,
        implementationNotes: ctl.implementation_notes,
        appliesToAll: ctl.applies_to_all,
        requirements: (d.control_requirements ?? []).filter((r) => r.control_id === ctl.id).map((r) => ({ title: r.title, text: r.text, party: r.source_party, source: r.source_name, document: r.source_document })),
        solutions: d.solutions.filter((s) => solutionIds.includes(s.id)).map((s) => ({ code: s.code, title: s.title })),
        findings: d.findings.filter((f) => f.control_id === ctl.id).map(L.findingSummary),
      };
    },
  },
  {
    name: "list_findings",
    title: "List findings",
    description: "Search and filter findings. Returns a short summary per finding with client, location, control and linked plans.",
    readOnly: true,
    inputSchema: obj({
      search: str("Text to search in title and description"),
      client: str("Client name"),
      location: str("Location name"),
      control: str("Control code or name"),
      status: str("Status", { enum: STATUSES }),
      open: { type: "boolean", description: "true = only findings that are not done" },
      severity: str("Severity", { enum: SEVERITIES }),
      overdue: { type: "boolean", description: "true = only open findings past their due date" },
      limit: int("Maximum number of results (default 50, max 200)", { minimum: 1, maximum: 200 }),
    }),
    run: async (a) => {
      const d = await loadAll();
      const L = lookups(d);
      const ctl = a.control ? resolveControl(d, a.control) : null;
      const q = lc(a.search);
      const items = d.findings
        .map((f) => ({ f, s: L.findingSummary(f) }))
        .filter(({ f, s }) =>
          (!q || lc(`${f.title} ${f.description}`).includes(q)) &&
          (!a.client || lc(s.client) === lc(a.client)) &&
          (!a.location || lc(s.location) === lc(a.location)) &&
          (!ctl || f.control_id === ctl.id) &&
          (!a.status || f.status === a.status) &&
          (a.open !== true || f.status !== "done") &&
          (!a.severity || f.severity === a.severity) &&
          (a.overdue !== true || s.overdue))
        .map(({ s }) => s);
      return { total: items.length, items: items.slice(0, Math.min(200, Number(a.limit ?? 50))) };
    },
  },
  {
    name: "get_finding",
    title: "Get finding",
    description: "Full details of one finding, including its description and remediation plans.",
    readOnly: true,
    inputSchema: obj({ finding: str("Finding id (see list_findings)") }, ["finding"]),
    run: async (a) => {
      const d = await loadAll();
      const L = lookups(d);
      const f = resolveFinding(d, a.finding);
      return { ...L.findingSummary(f), description: f.description, created_at: f.created_at, updated_at: f.updated_at };
    },
  },
  {
    name: "list_remediation_plans",
    title: "List remediation plans",
    description: "Remediation plans with code, status, owner, due date, effort and number of linked findings.",
    readOnly: true,
    inputSchema: obj({ status: str("Status", { enum: STATUSES }), search: str("Text to search in code and title"), open: { type: "boolean", description: "true = only plans that are not done" } }),
    run: async (a) => {
      const d = await loadAll();
      const q = lc(a.search);
      return d.remediation_plans
        .filter((p) => (!a.status || p.status === a.status) && (a.open !== true || p.status !== "done") && (!q || lc(`${p.code} ${p.title}`).includes(q)))
        .map((p) => ({
          id: p.id, code: p.code, title: p.title, status: p.status, assignee: p.assignee, due_date: day(p.due_date),
          effort_days: p.effort_days == null ? null : Number(p.effort_days),
          findings: d.remediation_plan_findings.filter((x) => x.plan_id === p.id).length,
        }));
    },
  },
  {
    name: "get_remediation_plan",
    title: "Get remediation plan",
    description: "Full details of a remediation plan: description, linked findings, solutions, recent comments and attachment names.",
    readOnly: true,
    inputSchema: obj({ plan: str("Plan code (e.g. RP-003) or id") }, ["plan"]),
    run: async (a) => {
      const d = await loadAll();
      const L = lookups(d);
      const p = resolvePlan(d, a.plan);
      const findingIds = d.remediation_plan_findings.filter((x) => x.plan_id === p.id).map((x) => x.finding_id);
      const solutionIds = d.solution_remediations.filter((x) => x.plan_id === p.id).map((x) => x.solution_id);
      return {
        id: p.id, code: p.code, title: p.title, status: p.status, assignee: p.assignee, due_date: day(p.due_date),
        effort_days: p.effort_days == null ? null : Number(p.effort_days), description: p.description,
        findings: d.findings.filter((f) => findingIds.includes(f.id)).map(L.findingSummary),
        solutions: d.solutions.filter((s) => solutionIds.includes(s.id)).map((s) => ({ code: s.code, title: s.title })),
        comments: d.comments.filter((c) => c.plan_id === p.id).slice(0, 20).map((c) => ({ author: c.author, at: c.created_at, text: excerpt(c.body, 500) })),
        attachments: d.attachments.filter((x) => x.plan_id === p.id).map((x) => x.file_name),
      };
    },
  },
  {
    name: "search_solutions",
    title: "Search solutions",
    description: "Find reusable remediation guidance in the solutions library.",
    readOnly: true,
    inputSchema: obj({ query: str("Words to search in title, tags and text; empty = all") }),
    run: async (a) => {
      const d = await loadAll();
      const L = lookups(d);
      const words = lc(a.query).split(/\s+/).filter(Boolean);
      return d.solutions
        .map((s) => {
          const hay = lc(`${s.code} ${s.title} ${(s.tags ?? []).join(" ")} ${excerpt(s.body, 5000)}`);
          return { s, score: words.length ? words.filter((w) => hay.includes(w)).length : 1 };
        })
        .filter((x) => x.score > 0)
        .sort((x, y) => y.score - x.score)
        .slice(0, 10)
        .map(({ s }) => ({
          code: s.code, title: s.title, tags: s.tags, text: excerpt(s.body, 800),
          controls: d.solution_controls.filter((x) => x.solution_id === s.id).map((x) => L.controlCode(x.control_id)).filter(Boolean),
        }));
    },
  },
  {
    name: "list_notes",
    title: "List notes",
    description: "Recent notes (unstructured observations), newest first.",
    readOnly: true,
    inputSchema: obj({ unprocessed: { type: "boolean", description: "true = only notes not yet turned into findings" } }),
    run: async (a) => {
      const d = await loadAll();
      return d.notes.filter((n) => a.unprocessed !== true || !n.processed).slice(0, 30).map((n) => ({ id: n.id, title: n.title, processed: n.processed, updated_at: n.updated_at, text: excerpt(n.body, 1500) }));
    },
  },
  {
    name: "list_control_templates",
    title: "List control templates",
    description: "Built-in control templates: the recommended baseline (CIS Controls v8 / NIST CSF 2.0) and complete frameworks such as ISO/IEC 27001:2022 Annex A. Add them with add_controls_from_templates.",
    readOnly: true,
    inputSchema: obj({}),
    run: async () => {
      const d = await loadAll();
      const existing = new Set(d.control_catalog.map((c) => c.code).filter(Boolean));
      return {
        baseline: BASELINE_SETS.map((s) => ({ function: s.name, controls: s.controls.map((c) => ({ code: c.code, name: c.name, essential: !!c.essential, added: existing.has(c.code) })) })),
        frameworks: FRAMEWORKS.map((f) => {
          const cs = frameworkControls(f.id);
          return { id: f.id, name: f.name, controls: cs.length, added: cs.filter((c) => existing.has(c.code)).length };
        }),
      };
    },
  },

  /* ---- change ---- */
  {
    name: "create_finding",
    title: "Create a finding",
    description: "Register a finding: a control that is not (fully) met at a location.",
    readOnly: false,
    inputSchema: obj({
      title: str("Short title"),
      description: str("What was found"),
      control: str("Control code (e.g. PR-02), name or id"),
      location: str('Location id, name, or "Client / Location"'),
      client: str("Client name, when the location name is not unique"),
      severity: str("Severity", { enum: SEVERITIES }),
      status: str("Status (default todo)", { enum: STATUSES }),
      assignee: str("Who works on it"),
      due_date: str("Due date YYYY-MM-DD"),
    }, ["title", "control", "location", "severity"]),
    run: async (a, actor) => {
      const d = await loadAll();
      const ctl = resolveControl(d, a.control);
      const loc = resolveLocation(d, a.location, a.client);
      const f = pickFields(a, ["title", "description", "severity", "status", "assignee", "due_date"]);
      const res = await callApi("POST", "findings", { control_id: ctl.id, location_id: loc.id, title: f.title, description: f.description ?? null, severity: f.severity, status: f.status ?? "todo", assignee: f.assignee ?? null }, actor);
      if (f.due_date) await callApi("PATCH", `findings/${res.data.id}`, { due_date: f.due_date }, actor);
      return { id: res.data.id, title: f.title, created: true };
    },
  },
  {
    name: "update_finding",
    title: "Update a finding",
    description: "Change fields of a finding (status, severity, assignee, due date, title or description). Only the given fields change.",
    readOnly: false,
    inputSchema: obj({
      finding: str("Finding id"),
      title: str("New title"),
      description: str("New description"),
      severity: str("Severity", { enum: SEVERITIES }),
      status: str("Status", { enum: STATUSES }),
      assignee: str("Assignee"),
      due_date: str("Due date YYYY-MM-DD"),
    }, ["finding"]),
    run: async (a, actor) => {
      const d = await loadAll();
      const f = resolveFinding(d, a.finding);
      const patch = pickFields(a, ["title", "description", "severity", "status", "assignee", "due_date"]);
      if (!Object.keys(patch).length) throw new ToolError("Nothing to change: give at least one field.");
      await callApi("PATCH", `findings/${f.id}`, patch, actor);
      return { id: f.id, changed: Object.keys(patch) };
    },
  },
  {
    name: "create_remediation_plan",
    title: "Create a remediation plan",
    description: "Create a remediation plan (code RP-xxx is assigned automatically), optionally linked to findings and solutions.",
    readOnly: false,
    inputSchema: obj({
      title: str("Title"),
      description: str("Approach, steps and scope (plain text)"),
      assignee: str("Owner"),
      due_date: str("Due date YYYY-MM-DD"),
      effort_days: num("Estimated effort in working days", { minimum: 0 }),
      status: str("Status (default todo)", { enum: STATUSES }),
      findings: strList("Ids of findings this plan addresses"),
      solutions: strList("Codes or titles of solutions to link"),
    }, ["title"]),
    run: async (a, actor) => {
      const d = await loadAll();
      const fields = pickFields(a, ["title", "description", "assignee", "due_date", "status"]);
      const findings = (a.findings ?? []).map((id) => resolveFinding(d, id));
      const solutions = (a.solutions ?? []).map((ref) => {
        const s = d.solutions.find((x) => lc(x.code) === lc(ref) || lc(x.title) === lc(ref) || x.id === ref);
        if (!s) throw new ToolError(`No solution "${ref}". Use search_solutions.`);
        return s;
      });
      const code = nextPlanCode(d);
      const res = await callApi("POST", "remediation-plans", { code, ...fields, effort_days: a.effort_days ?? null }, actor);
      const planId = res.data.id;
      for (const f of findings) await callApi("POST", "remediation-plan-findings", { plan_id: planId, finding_id: f.id }, actor);
      for (const s of solutions) await callApi("POST", "solution-remediations", { solution_id: s.id, plan_id: planId }, actor);
      return { id: planId, code, title: fields.title, findings: findings.length, solutions: solutions.length };
    },
  },
  {
    name: "update_remediation_plan",
    title: "Update a remediation plan",
    description: "Change fields of a remediation plan and/or link more findings. Only the given fields change.",
    readOnly: false,
    inputSchema: obj({
      plan: str("Plan code (e.g. RP-003) or id"),
      title: str("New title"),
      description: str("New description"),
      assignee: str("Owner"),
      due_date: str("Due date YYYY-MM-DD"),
      effort_days: num("Effort in working days", { minimum: 0 }),
      status: str("Status", { enum: STATUSES }),
      add_findings: strList("Ids of findings to link to the plan"),
    }, ["plan"]),
    run: async (a, actor) => {
      const d = await loadAll();
      const p = resolvePlan(d, a.plan);
      const patch = pickFields(a, ["title", "description", "assignee", "due_date", "status"]);
      if (a.effort_days !== undefined) patch.effort_days = a.effort_days;
      const findings = (a.add_findings ?? []).map((id) => resolveFinding(d, id));
      if (!Object.keys(patch).length && !findings.length) throw new ToolError("Nothing to change.");
      if (Object.keys(patch).length) await callApi("PATCH", `remediation-plans/${p.id}`, patch, actor);
      for (const f of findings) await callApi("POST", "remediation-plan-findings", { plan_id: p.id, finding_id: f.id }, actor);
      return { code: p.code, changed: Object.keys(patch), linkedFindings: findings.length };
    },
  },
  {
    name: "add_plan_comment",
    title: "Comment on a remediation plan",
    description: "Add a comment to a remediation plan.",
    readOnly: false,
    inputSchema: obj({ plan: str("Plan code or id"), text: str("The comment") }, ["plan", "text"]),
    run: async (a, actor) => {
      const d = await loadAll();
      const p = resolvePlan(d, a.plan);
      await callApi("POST", "comments", { plan_id: p.id, body: String(a.text), author: actor || "MCP" }, actor);
      return { ok: true, plan: p.code };
    },
  },
  {
    name: "add_note",
    title: "Add a note",
    description: "Add a note with unstructured observations.",
    readOnly: false,
    inputSchema: obj({ title: str("Title"), body: str("Text") }, ["body"]),
    run: async (a, actor) => {
      const res = await callApi("POST", "notes", { title: a.title ?? null, body: String(a.body) }, actor);
      return { id: res.data?.id, created: true };
    },
  },
  {
    name: "add_client",
    title: "Add a client",
    description: "Add a client with its locations. An existing client (same name) gets the missing locations added.",
    readOnly: false,
    inputSchema: obj({ name: str("Client name"), description: str("Description"), locations: strList("Location names") }, ["name"]),
    run: async (a, actor) => {
      const res = await callApi("POST", "setup/apply", { clients: [{ name: a.name, description: a.description ?? null, locations: a.locations ?? [] }] }, actor);
      return res.data;
    },
  },
  {
    name: "add_controls_from_templates",
    title: "Add controls from templates",
    description: "Add controls from the built-in templates by code and/or complete frameworks by id (see list_control_templates). Existing controls are skipped.",
    readOnly: false,
    inputSchema: obj({ codes: strList("Template control codes, e.g. PR-02"), frameworks: strList("Framework ids, e.g. iso27001-2022") }),
    run: async (a, actor) => {
      const byCode = templateControlsByCode();
      const controls = [];
      const add = (c) => c && !controls.some((x) => x.code === c.code) && controls.push({ code: c.code, name: c.name, description: c.description });
      for (const code of a.codes ?? []) {
        const c = byCode.get(String(code).trim().toUpperCase());
        if (!c) throw new ToolError(`Unknown template code "${code}".`);
        add(c);
      }
      for (const id of a.frameworks ?? []) {
        const cs = frameworkControls(lc(id));
        if (!cs.length) throw new ToolError(`Unknown framework "${id}".`);
        cs.forEach(add);
      }
      if (!controls.length) throw new ToolError("Give codes and/or frameworks.");
      return (await callApi("POST", "setup/apply", { controls }, actor)).data;
    },
  },
  {
    name: "apply_setup",
    title: "Apply a setup plan",
    description: "Add clients (with locations), controls and solutions in one go. Existing items (same name or code) are skipped. Used by the AI setup.",
    readOnly: false,
    inputSchema: obj({
      clients: { type: "array", items: { type: "object" }, description: "[{ name, description, locations: [string] }]" },
      controls: { type: "array", items: { type: "object" }, description: "[{ code, name, description }]" },
      solutions: { type: "array", items: { type: "object" }, description: "[{ code, title, body (HTML), tags: [string], controls: [control codes] }]" },
    }),
    run: async (a, actor) => (await callApi("POST", "setup/apply", { clients: a.clients ?? [], controls: a.controls ?? [], solutions: a.solutions ?? [] }, actor)).data,
  },
  {
    name: "update_texts",
    title: "Update text fields",
    description: "Replace text fields in bulk, e.g. after translation. Items: { table, id, field, text } for notes (title, body), findings (title, description), control_catalog (name, description), controls (name, implementation_notes), remediation_plans (title, description), solutions (title, body) and comments (body).",
    readOnly: false,
    inputSchema: obj({ items: { type: "array", items: { type: "object" }, description: "[{ table, id, field, text }]" } }, ["items"]),
    run: async (a, actor) => (await callApi("POST", "texts/update", { items: a.items ?? [] }, actor)).data,
  },
];

/* ---------- JSON-RPC ---------- */
const rpcResult = (id, result) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id, code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function dispatch(msg, actor) {
  const isNotification = msg.id === undefined;
  switch (msg.method) {
    case "initialize": {
      const requested = String(msg.params?.protocolVersion ?? "");
      return rpcResult(msg.id, {
        protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "auditrack", title: "audiTrack", version: VERSION },
        instructions:
          "audiTrack audit findings tracker. Look up clients, controls, findings, remediation plans, solutions and notes; register findings, create and update remediation plans, add comments and notes, and add controls from templates (CIS v8 baseline, ISO 27001 Annex A).",
      });
    }
    case "ping":
      return rpcResult(msg.id, {});
    case "tools/list":
      return rpcResult(msg.id, {
        tools: TOOLS.map((t) => ({
          name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema,
          annotations: { title: t.title, readOnlyHint: t.readOnly, destructiveHint: false, openWorldHint: false },
        })),
      });
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === msg.params?.name);
      if (!tool) return rpcError(msg.id, -32602, `Unknown tool: ${String(msg.params?.name)}`);
      try {
        const out = await tool.run(msg.params?.arguments ?? {}, actor);
        return rpcResult(msg.id, { content: [{ type: "text", text: JSON.stringify(out, null, 2) }], isError: false });
      } catch (e) {
        // Tool failures go into the result, so the model can see and handle them.
        return rpcResult(msg.id, { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true });
      }
    }
    default:
      if (isNotification) return null; // e.g. notifications/initialized
      return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

function tokenOk(header) {
  if (!MCP_TOKEN) return true;
  const expected = Buffer.from(`Bearer ${MCP_TOKEN}`);
  const given = Buffer.from(String(header ?? ""));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Handles /mcp on the Node HTTP server. body: raw request body (Buffer). */
export async function handleMcp(req, res, body) {
  const send = (status, data, headers = {}) => {
    res.writeHead(status, { "Content-Type": "application/json", ...headers });
    res.end(data === undefined ? undefined : JSON.stringify(data));
  };
  // DNS-rebinding protection: browsers send Origin; only same-host origins are accepted.
  const origin = req.headers.origin;
  if (origin) {
    let host = "";
    try {
      host = new URL(origin).host;
    } catch {
      /* invalid origin */
    }
    if (host !== req.headers.host) return send(403, { error: "Origin not allowed" });
  }
  if (!tokenOk(req.headers.authorization)) {
    return send(401, { error: ENV_TOKEN ? "Unauthorized" : "MCP is for internal use while the login is on. Set AUDITRACK_MCP_TOKEN to use external MCP clients." }, { "WWW-Authenticate": 'Bearer realm="auditrack-mcp"' });
  }
  if (req.method !== "POST") {
    res.writeHead(405, { Allow: "POST" }); // stateless: no server-initiated stream, no sessions
    return res.end();
  }
  let parsed;
  try {
    parsed = JSON.parse(body.toString("utf8"));
  } catch {
    return send(400, rpcError(null, -32700, "Parse error"));
  }
  const clientName = req.headers["x-auditrack-actor"] ? decodeURIComponent(String(req.headers["x-auditrack-actor"])) : "client";
  const actor = `MCP: ${clientName}`.slice(0, 200);
  const msgs = Array.isArray(parsed) ? parsed : [parsed];
  const out = [];
  for (const m of msgs) {
    if (!m || m.jsonrpc !== "2.0" || typeof m.method !== "string") {
      out.push(rpcError(m?.id, -32600, "Invalid request"));
      continue;
    }
    const r = await dispatch(m, actor);
    if (r) out.push(r);
  }
  if (!out.length) {
    res.writeHead(202); // only notifications
    return res.end();
  }
  return send(200, Array.isArray(parsed) ? out : out[0]);
}
