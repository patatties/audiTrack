import { app } from "../router.js";

import { pool } from "../db.js";

app.http("solutions", {
  methods: ["POST", "PATCH", "DELETE"],
  route: "solutions/{id?}",
  handler: async (request, context) => {
    const client = await pool.connect();
    try {
      const method = request.method;
      const id = request.params.id;

      if (method === "POST") {
        const body = await request.json();
        const result = await client.query(
          `INSERT INTO solutions (id, code, title, body, tags) VALUES (gen_random_uuid(), $1, $2, $3, $4) RETURNING *`,
          [body.code ?? null, body.title ?? "Untitled solution", body.body ?? "", body.tags ?? []]
        );
        return { status: 201, jsonBody: { ok: true, data: result.rows[0] } };
      }

      if (method === "PATCH" && id) {
        const body = await request.json();
        await client.query(
          `UPDATE solutions SET title = $1, body = $2, tags = $3, updated_at = now() WHERE id = $4`,
          [body.title, body.body, body.tags, id]
        );
        return { status: 200, jsonBody: { ok: true } };
      }

      if (method === "DELETE" && id) {
        await client.query(`DELETE FROM solution_controls WHERE solution_id = $1`, [id]);
        await client.query(`DELETE FROM solution_remediations WHERE solution_id = $1`, [id]);
        await client.query(`DELETE FROM solutions WHERE id = $1`, [id]);
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
