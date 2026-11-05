import { app } from "../router.js";

import { pool } from "../db.js";

// Export order respects FK dependencies; restore uses the same order.
const TABLE_ORDER = [
  "clients",
  "locations",
  "control_catalog",
  "controls",
  "control_locations",
  "findings",
  "remediation_plans",
  "remediation_plan_findings",
  "comments",
  "attachments",
  "notes",
  "solutions",
  "solution_controls",
  "solution_remediations",
  "control_requirements",
  "requirement_sources",
];

app.http("backup", {
  methods: ["GET", "POST"],
  route: "backup",
  handler: async (request, context) => {
    const client = await pool.connect();
    try {
      /* ---- EXPORT ---- */
      if (request.method === "GET") {
        const tables = {};
        for (const table of TABLE_ORDER) {
          const result = await client.query(`SELECT * FROM ${table}`);
          tables[table] = result.rows;
        }

        const payload = JSON.stringify({
          version: 1,
          exported_at: new Date().toISOString(),
          tables,
        });

        const date = new Date().toISOString().slice(0, 10);
        return {
          status: 200,
          body: payload,
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition": `attachment; filename="auditrack-backup-${date}.json"`,
          },
        };
      }

      /* ---- RESTORE ---- */
      if (request.method === "POST") {
        let backup;
        try {
          backup = await request.json();
        } catch {
          return { status: 400, jsonBody: { ok: false, error: "Invalid JSON body" } };
        }

        if (!backup?.tables) {
          return { status: 400, jsonBody: { ok: false, error: "Invalid backup file" } };
        }

        // Truncate all tables in reverse order to respect FK constraints
        await client.query("BEGIN");
        for (const table of [...TABLE_ORDER].reverse()) {
          await client.query(`TRUNCATE ${table} CASCADE`);
        }

        // Re-insert in dependency order using parameterized queries
        for (const table of TABLE_ORDER) {
          const rows = backup.tables[table];
          if (!rows?.length) continue;

          const columns = Object.keys(rows[0]);
          const colList = columns.map((c) => `"${c}"`).join(", ");

          for (const row of rows) {
            const values = columns.map((c) => row[c]);
            const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
            await client.query(
              `INSERT INTO ${table} (${colList}) VALUES (${placeholders})`,
              values
            );
          }
        }

        await client.query("COMMIT");
        return { status: 200, jsonBody: { ok: true } };
      }

      return { status: 405, jsonBody: { ok: false, error: "Method not allowed" } };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      context.error(error);
      return { status: 500, jsonBody: { ok: false, error: error.message } };
    } finally {
      client.release();
    }
  },
});
