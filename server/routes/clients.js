import { app } from "../router.js";

import { pool } from "../db.js";

app.http("clients", {
  methods: ["POST", "PATCH", "DELETE"],
  route: "clients/{id?}",
  handler: async (request, context) => {
    const client = await pool.connect();
    try {
      const method = request.method;
      const id = request.params.id;

      if (method === "POST") {
        const body = await request.json();
        const result = await client.query(
          `INSERT INTO clients (id, name, description) VALUES (gen_random_uuid(), $1, $2) RETURNING *`,
          [body.name, body.description ?? null]
        );
        return { status: 201, jsonBody: { ok: true, data: result.rows[0] } };
      }

      if (method === "PATCH" && id) {
        const body = await request.json();
        await client.query(
          `UPDATE clients SET name = $1, description = $2 WHERE id = $3`,
          [body.name, body.description ?? null, id]
        );
        return { status: 200, jsonBody: { ok: true } };
      }

      if (method === "DELETE" && id) {
        await client.query(`DELETE FROM clients WHERE id = $1`, [id]);
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
