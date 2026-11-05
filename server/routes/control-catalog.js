import { app } from "../router.js";

import { pool } from "../db.js";

app.http("controlCatalog", {
  methods: ["POST", "PATCH", "DELETE"],
  route: "control-catalog/{id?}",
  handler: async (request, context) => {
    const client = await pool.connect();
    try {
      const method = request.method;
      const id = request.params.id;

      if (method === "POST") {
        const body = await request.json();
        const result = await client.query(
          `INSERT INTO control_catalog (id, code, name, description) VALUES (gen_random_uuid(), $1, $2, $3) RETURNING *`,
          [body.code ?? null, body.name, body.description ?? null]
        );
        return { status: 201, jsonBody: { ok: true, data: result.rows[0] } };
      }

      if (method === "PATCH" && id) {
        const body = await request.json();
        await client.query(
          `UPDATE control_catalog SET code = $1, name = $2, description = $3 WHERE id = $4`,
          [body.code ?? null, body.name, body.description ?? null, id]
        );
        return { status: 200, jsonBody: { ok: true } };
      }

      if (method === "DELETE" && id) {
        await client.query(`DELETE FROM control_catalog WHERE id = $1`, [id]);
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
