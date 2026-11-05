import { app } from "../router.js";
import { pool } from "../db.js";

// Bulk update of text fields (used by "Translate all" through the MCP tool update_texts).
// Only these table/field combinations can be changed.
const ALLOWED = {
  notes: ["title", "body"],
  findings: ["title", "description"],
  control_catalog: ["name", "description"],
  controls: ["name", "implementation_notes"],
  remediation_plans: ["title", "description"],
  solutions: ["title", "body"],
  comments: ["body"],
};

app.http("texts", {
  methods: ["POST"],
  route: "texts/update",
  handler: async (request, context) => {
    const client = await pool.connect();
    try {
      const { items } = await request.json();
      if (!Array.isArray(items)) return { status: 400, jsonBody: { ok: false, error: "items must be an array" } };
      for (const it of items) {
        if (!ALLOWED[it?.table]?.includes(it?.field) || typeof it.id !== "string" || typeof it.text !== "string") {
          return { status: 400, jsonBody: { ok: false, error: `Not allowed: ${it?.table}.${it?.field}` } };
        }
      }
      await client.query("BEGIN");
      let updated = 0;
      for (const it of items) {
        // Table and field come from the allow-list above, never from free input.
        const res = await client.query(`UPDATE ${it.table} SET ${it.field} = $1 WHERE id = $2`, [it.text, it.id]);
        updated += res.rowCount ?? 0;
      }
      await client.query("COMMIT");
      return { status: 200, jsonBody: { ok: true, data: { updated } } };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      context.error(error);
      return { status: 500, jsonBody: { ok: false, error: error.message } };
    } finally {
      client.release();
    }
  },
});
