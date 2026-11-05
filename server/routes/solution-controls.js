import { app } from "../router.js";

import { pool } from "../db.js";

app.http("solutionControls", {
  methods: ["POST", "DELETE"],
  route: "solution-controls",
  handler: async (request, context) => {
    const client = await pool.connect();
    try {
      const method = request.method;

      if (method === "POST") {
        const body = await request.json();
        await client.query(
          `INSERT INTO solution_controls (solution_id, control_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [body.solution_id, body.control_id]
        );
        return { status: 201, jsonBody: { ok: true } };
      }

      if (method === "DELETE") {
        const body = await request.json();
        if (body.solution_id && body.control_id) {
          await client.query(
            `DELETE FROM solution_controls WHERE solution_id = $1 AND control_id = $2`,
            [body.solution_id, body.control_id]
          );
        } else if (body.solution_id) {
          await client.query(`DELETE FROM solution_controls WHERE solution_id = $1`, [body.solution_id]);
        } else {
          return { status: 400, jsonBody: { ok: false, error: "Need solution_id" } };
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
