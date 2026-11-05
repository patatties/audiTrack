import { app } from "../router.js";

import { pool } from "../db.js";

app.http("remediationPlans", {
  methods: ["POST", "PATCH", "DELETE"],
  route: "remediation-plans/{id?}",
  handler: async (request, context) => {
    const client = await pool.connect();
    try {
      const method = request.method;
      const id = request.params.id;

      if (method === "POST") {
        const body = await request.json();
        const result = await client.query(
          `INSERT INTO remediation_plans (id, code, title, description, status, assignee, due_date, effort_days)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [body.code ?? null, body.title ?? "Untitled plan", body.description ?? null,
           body.status ?? "todo", body.assignee ?? null, body.due_date ?? null, body.effort_days ?? null]
        );
        return { status: 201, jsonBody: { ok: true, data: result.rows[0] } };
      }

      if (method === "PATCH" && id) {
        const body = await request.json();
        const ALLOWED = new Set(["code", "title", "description", "status", "assignee", "due_date", "effort_days", "created_at"]);
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
          `UPDATE remediation_plans SET ${fields.join(", ")} WHERE id = $${i}`,
          values
        );
        return { status: 200, jsonBody: { ok: true } };
      }

      if (method === "DELETE" && id) {
        // Cascade-clean child rows
        await client.query(`DELETE FROM comments WHERE plan_id = $1`, [id]);
        await client.query(`DELETE FROM attachments WHERE plan_id = $1`, [id]);
        await client.query(`DELETE FROM remediation_plan_findings WHERE plan_id = $1`, [id]);
        await client.query(`DELETE FROM solution_remediations WHERE plan_id = $1`, [id]);
        await client.query(`DELETE FROM remediation_plans WHERE id = $1`, [id]);
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
