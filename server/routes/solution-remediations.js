import { app } from "../router.js";

import { pool } from "../db.js";

app.http("solutionRemediations", {
  methods: ["POST", "DELETE"],
  route: "solution-remediations",
  handler: async (request, context) => {
    const client = await pool.connect();
    try {
      const method = request.method;

      if (method === "POST") {
        const body = await request.json();
        await client.query(
          `INSERT INTO solution_remediations (solution_id, plan_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [body.solution_id, body.plan_id]
        );
        return { status: 201, jsonBody: { ok: true } };
      }

      if (method === "DELETE") {
        const body = await request.json();
        if (body.solution_id && body.plan_id) {
          await client.query(
            `DELETE FROM solution_remediations WHERE solution_id = $1 AND plan_id = $2`,
            [body.solution_id, body.plan_id]
          );
        } else if (body.solution_id) {
          await client.query(`DELETE FROM solution_remediations WHERE solution_id = $1`, [body.solution_id]);
        } else if (body.plan_id) {
          await client.query(`DELETE FROM solution_remediations WHERE plan_id = $1`, [body.plan_id]);
        } else {
          return { status: 400, jsonBody: { ok: false, error: "Need solution_id or plan_id" } };
        }
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
