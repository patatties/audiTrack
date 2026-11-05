import { app } from "../router.js";

import { pool } from "../db.js";

app.http("comments", {
  methods: ["POST", "PATCH", "DELETE"],
  route: "comments/{id?}",
  handler: async (request, context) => {
    const client = await pool.connect();
    try {
      const method = request.method;
      const id = request.params.id;

      if (method === "POST") {
        const body = await request.json();
        const result = await client.query(
          `INSERT INTO comments (id, plan_id, body, author) VALUES (gen_random_uuid(), $1, $2, $3) RETURNING *`,
          [body.plan_id, body.body, body.author ?? null]
        );
        return { status: 201, jsonBody: { ok: true, data: result.rows[0] } };
      }

      if (method === "PATCH" && id) {
        const body = await request.json();
        await client.query(
          `UPDATE comments SET body = $1 WHERE id = $2`,
          [body.body, id]
        );
        return { status: 200, jsonBody: { ok: true } };
      }

      if (method === "DELETE") {
        if (id) {
          await client.query(`DELETE FROM comments WHERE id = $1`, [id]);
        } else {
          const body = await request.json().catch(() => ({}));
          if (body.plan_id) {
            await client.query(`DELETE FROM comments WHERE plan_id = $1`, [body.plan_id]);
          } else {
            return { status: 400, jsonBody: { ok: false, error: "Need id or plan_id" } };
          }
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
