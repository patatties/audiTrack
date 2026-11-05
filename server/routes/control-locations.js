import { app } from "../router.js";

import { pool } from "../db.js";

app.http("controlLocations", {
  methods: ["POST", "DELETE"],
  route: "control-locations",
  handler: async (request, context) => {
    const client = await pool.connect();
    try {
      const method = request.method;

      if (method === "POST") {
        const body = await request.json();
        // body: [{ control_id, location_id }] or { control_id, location_id }
        const rows = Array.isArray(body) ? body : [body];
        for (const row of rows) {
          await client.query(
            `INSERT INTO control_locations (control_id, location_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [row.control_id, row.location_id]
          );
        }
        return { status: 201, jsonBody: { ok: true } };
      }

      if (method === "DELETE") {
        const body = await request.json();
        if (body.control_id && Array.isArray(body.location_ids)) {
          await client.query(
            `DELETE FROM control_locations WHERE control_id = $1 AND location_id = ANY($2::uuid[])`,
            [body.control_id, body.location_ids]
          );
        } else if (body.control_id && body.location_id) {
          await client.query(
            `DELETE FROM control_locations WHERE control_id = $1 AND location_id = $2`,
            [body.control_id, body.location_id]
          );
        } else if (body.control_id) {
          await client.query(`DELETE FROM control_locations WHERE control_id = $1`, [body.control_id]);
        } else {
          return { status: 400, jsonBody: { ok: false, error: "Need control_id" } };
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
