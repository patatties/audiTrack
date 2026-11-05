import { app } from "../router.js";

import { pool } from "../db.js";

app.http("findings", {
  methods: ["POST", "PATCH", "DELETE"],
  route: "findings/{id?}",
  handler: async (request, context) => {
    const client = await pool.connect();
    try {
      const method = request.method;
      const id = request.params.id;

      if (method === "POST") {
        const body = await request.json();
        const result = await client.query(
          `INSERT INTO findings (id, control_id, location_id, title, description, severity, status, assignee, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, now(), now()) RETURNING *`,
          [body.control_id, body.location_id, body.title, body.description ?? null,
           body.severity, body.status ?? "todo", body.assignee ?? null]
        );
        return { status: 201, jsonBody: { ok: true, data: result.rows[0] } };
      }

      if (method === "PATCH" && id) {
        const body = await request.json();
        const ALLOWED = new Set(["control_id", "location_id", "title", "description", "severity", "status", "assignee", "due_date", "position", "created_at"]);
        const fields = [];
        const values = [];
        let i = 1;
        for (const [k, v] of Object.entries(body)) {
          if (!ALLOWED.has(k)) continue;
          fields.push(`${k} = $${i++}`);
          values.push(v);
        }
        fields.push(`updated_at = now()`);
        values.push(id);
        await client.query(
          `UPDATE findings SET ${fields.join(", ")} WHERE id = $${i}`,
          values
        );
        return { status: 200, jsonBody: { ok: true } };
      }

      if (method === "DELETE" && id) {
        await client.query(`DELETE FROM remediation_plan_findings WHERE finding_id = $1`, [id]);
        await client.query(`DELETE FROM findings WHERE id = $1`, [id]);
        return { status: 200, jsonBody: { ok: true } };
      }

      return { status: 400, jsonBody: { ok: false, error: "Bad request" } };
    } catch (error) {
      context.error(error);
      return { status: 500, jsonBody: { ok: false, error: error.message } };
    } finally {
      client.release();
    }
  },
});
