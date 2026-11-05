import { app } from "../router.js";

import { pool } from "../db.js";

app.http("controls", {
  methods: ["POST", "PATCH", "DELETE"],
  route: "controls/{id?}",
  handler: async (request, context) => {
    const client = await pool.connect();
    try {
      const method = request.method;
      const id = request.params.id;

      if (method === "POST") {
        const body = await request.json();
        const result = await client.query(
          `INSERT INTO controls (id, name, catalog_id, applies_to_all) VALUES (gen_random_uuid(), $1, $2, $3) RETURNING *`,
          [body.name, body.catalog_id ?? null, body.applies_to_all ?? false]
        );
        return { status: 201, jsonBody: { ok: true, data: result.rows[0] } };
      }

      if (method === "PATCH" && id) {
        const body = await request.json();
        const ALLOWED = new Set(["name", "catalog_id", "implementation_notes", "applies_to_all", "location_id"]);
        const fields = [];
        const values = [];
        let i = 1;
        for (const [k, v] of Object.entries(body)) {
          if (!ALLOWED.has(k)) continue;
          fields.push(`${k} = $${i++}`);
          values.push(v);
        }
        values.push(id);
        await client.query(
          `UPDATE controls SET ${fields.join(", ")} WHERE id = $${i}`,
          values
        );
        return { status: 200, jsonBody: { ok: true } };
      }

      if (method === "DELETE" && id) {
        await client.query(`DELETE FROM controls WHERE id = $1`, [id]);
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
