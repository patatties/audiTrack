import { app } from "../router.js";

import { pool } from "../db.js";

app.http("notes", {
  methods: ["POST", "PATCH", "DELETE"],
  route: "notes/{id?}",
  handler: async (request, context) => {
    const client = await pool.connect();
    try {
      const method = request.method;
      const id = request.params.id;

      if (method === "POST") {
        const body = await request.json();
        const result = await client.query(
          `INSERT INTO notes (id, title, body) VALUES (gen_random_uuid(), $1, $2) RETURNING *`,
          [body.title ?? null, body.body]
        );
        return { status: 201, jsonBody: { ok: true, data: result.rows[0] } };
      }

      if (method === "PATCH" && id) {
        const body = await request.json();
        const ALLOWED = new Set(["title", "body", "processed"]);
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
          `UPDATE notes SET ${fields.join(", ")} WHERE id = $${i}`,
          values
        );
        return { status: 200, jsonBody: { ok: true } };
      }

      if (method === "DELETE" && id) {
        await client.query(`DELETE FROM notes WHERE id = $1`, [id]);
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
