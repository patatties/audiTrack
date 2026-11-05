import { app } from "../router.js";

import { pool } from "../db.js";

app.http("locations", {
  methods: ["POST", "DELETE"],
  route: "locations/{id?}",
  handler: async (request, context) => {
    const client = await pool.connect();
    try {
      const method = request.method;
      const id = request.params.id;

      if (method === "POST") {
        const body = await request.json();
        const result = await client.query(
          `INSERT INTO locations (id, client_id, name) VALUES (gen_random_uuid(), $1, $2) RETURNING *`,
          [body.client_id, body.name]
        );
        return { status: 201, jsonBody: { ok: true, data: result.rows[0] } };
      }

      if (method === "DELETE" && id) {
        await client.query(`DELETE FROM locations WHERE id = $1`, [id]);
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
