// Shared insert logic for the first setup. Used by the wizard, the reviewed AI proposal
// and the demo data loader, so all three create records the same way.
//
// A setup plan looks like:
// {
//   clients:   [{ name, description?, locations: [name, ...] }],
//   controls:  [{ code?, name, description?, applies_to_all? }],
//   solutions: [{ code?, title, body (HTML), tags?: [], controls?: [control code, ...] }]
// }
// Existing records are reused instead of duplicated: clients by name, locations by name
// within a client, controls by catalog code (or name), solutions by code (or title).

const str = (v, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const key = (v) => str(v).toLowerCase();
// "template" or "ai": only shown on the review screen, ignored when applying.
const source = (v) => (v === "template" || v === "ai" ? v : undefined);

/** Normalises untrusted input (wizard form or AI output) into a clean plan. */
export function normalizePlan(input) {
  const plan = { clients: [], controls: [], solutions: [] };
  for (const c of Array.isArray(input?.clients) ? input.clients : []) {
    const name = str(c?.name, 200);
    if (!name) continue;
    const locations = [...new Set((Array.isArray(c.locations) ? c.locations : []).map((l) => str(l, 200)).filter(Boolean))];
    plan.clients.push({ name, description: str(c.description, 2000) || null, locations });
  }
  for (const c of Array.isArray(input?.controls) ? input.controls : []) {
    const name = str(c?.name, 300);
    if (!name) continue;
    plan.controls.push({
      code: str(c.code, 40) || null,
      name,
      description: str(c.description, 5000) || null,
      applies_to_all: c.applies_to_all !== false,
      source: source(c.source),
    });
  }
  for (const s of Array.isArray(input?.solutions) ? input.solutions : []) {
    const title = str(s?.title, 300);
    if (!title) continue;
    plan.solutions.push({
      code: str(s.code, 60) || null,
      title,
      body: str(s.body, 20000),
      tags: [...new Set((Array.isArray(s.tags) ? s.tags : []).map((t) => key(t).slice(0, 40)).filter(Boolean))],
      controls: (Array.isArray(s.controls) ? s.controls : []).map((c) => str(c, 40)).filter(Boolean),
      source: source(s.source),
    });
  }
  return plan;
}

/**
 * Inserts clients and locations. Returns a map "client name|location name" (lower case)
 * -> location id, plus client name (lower case) -> client id.
 */
export async function insertClients(db, clients, counts) {
  const clientIds = new Map();
  const locationIds = new Map();
  const existing = await db.query("SELECT id, name FROM clients");
  for (const r of existing.rows) clientIds.set(key(r.name), r.id);
  const existingLocs = await db.query("SELECT l.id, l.name, c.name AS client_name FROM locations l JOIN clients c ON c.id = l.client_id");
  for (const r of existingLocs.rows) locationIds.set(`${key(r.client_name)}|${key(r.name)}`, r.id);

  for (const c of clients) {
    let clientId = clientIds.get(key(c.name));
    if (!clientId) {
      const res = await db.query("INSERT INTO clients (name, description) VALUES ($1, $2) RETURNING id", [c.name, c.description ?? null]);
      clientId = res.rows[0].id;
      clientIds.set(key(c.name), clientId);
      counts.clients++;
    }
    for (const loc of c.locations ?? []) {
      const k = `${key(c.name)}|${key(loc)}`;
      if (locationIds.has(k)) continue;
      const res = await db.query("INSERT INTO locations (client_id, name) VALUES ($1, $2) RETURNING id", [clientId, loc]);
      locationIds.set(k, res.rows[0].id);
      counts.locations++;
    }
  }
  return { clientIds, locationIds };
}

/** Inserts catalog items with their control (1:1, as the Controls page does). Returns code/name -> control id. */
export async function insertControls(db, controls, counts) {
  const controlIds = new Map();
  const existing = await db.query(
    "SELECT c.id, c.name, cc.code FROM controls c LEFT JOIN control_catalog cc ON cc.id = c.catalog_id"
  );
  for (const r of existing.rows) {
    if (r.code) controlIds.set(key(r.code), r.id);
    controlIds.set(key(r.name), r.id);
  }
  for (const c of controls) {
    const k = key(c.code || c.name);
    if (controlIds.has(k) || controlIds.has(key(c.name))) continue;
    const cat = await db.query(
      "INSERT INTO control_catalog (code, name, description) VALUES ($1, $2, $3) RETURNING id",
      [c.code ?? null, c.name, c.description ?? null]
    );
    const ctrl = await db.query(
      "INSERT INTO controls (name, catalog_id, applies_to_all, implementation_notes) VALUES ($1, $2, $3, $4) RETURNING id",
      [c.name, cat.rows[0].id, c.applies_to_all !== false, c.implementation_notes ?? null]
    );
    const id = ctrl.rows[0].id;
    if (c.code) controlIds.set(key(c.code), id);
    controlIds.set(key(c.name), id);
    counts.controls++;
  }
  return controlIds;
}

/** Inserts solutions and links them to controls by code. Returns code/title -> solution id. */
export async function insertSolutions(db, solutions, controlIds, counts) {
  const solutionIds = new Map();
  const existing = await db.query("SELECT id, code, title FROM solutions");
  for (const r of existing.rows) {
    if (r.code) solutionIds.set(key(r.code), r.id);
    solutionIds.set(key(r.title), r.id);
  }
  for (const s of solutions) {
    if (solutionIds.has(key(s.code || s.title)) || solutionIds.has(key(s.title))) continue;
    const res = await db.query(
      "INSERT INTO solutions (code, title, body, tags) VALUES ($1, $2, $3, $4) RETURNING id",
      [s.code ?? null, s.title, s.body ?? "", s.tags ?? []]
    );
    const id = res.rows[0].id;
    if (s.code) solutionIds.set(key(s.code), id);
    solutionIds.set(key(s.title), id);
    counts.solutions++;
    for (const code of s.controls ?? []) {
      const controlId = controlIds.get(key(code));
      if (!controlId) continue;
      await db.query(
        "INSERT INTO solution_controls (solution_id, control_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [id, controlId]
      );
    }
  }
  return solutionIds;
}

export function emptyCounts() {
  return { clients: 0, locations: 0, controls: 0, solutions: 0, findings: 0, remediation_plans: 0, comments: 0, notes: 0, requirements: 0 };
}

/** Applies a (normalised) plan inside the caller's transaction. */
export async function applyPlan(db, plan) {
  const counts = emptyCounts();
  await insertClients(db, plan.clients, counts);
  const controlIds = await insertControls(db, plan.controls, counts);
  await insertSolutions(db, plan.solutions, controlIds, counts);
  return counts;
}

/** Escapes plain text and turns blank-line separated paragraphs into HTML (for AI output). */
export function textToHtml(text) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return str(text, 20000)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const lines = p.split("\n").map((l) => l.trim());
      if (lines.every((l) => /^[-*•]\s+/.test(l))) {
        return `<ul>${lines.map((l) => `<li>${esc(l.replace(/^[-*•]\s+/, ""))}</li>`).join("")}</ul>`;
      }
      return `<p>${lines.map(esc).join("<br>")}</p>`;
    })
    .join("\n");
}
