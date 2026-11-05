import { app } from "../router.js";

import { pool } from "../db.js";

async function upsertSources(client, body) {
  const entries = [
    ["party", body.source_party],
    ["name", body.source_name],
    ["department", body.source_department],
    ["document", body.source_document],
  ];
  for (const [field, value] of entries) {
    if (value?.trim()) {
      await client.query(
        "INSERT INTO requirement_sources (field, value) VALUES ($1, $2) ON CONFLICT (field, value) DO NOTHING",
        [field, value.trim()]
      );
    }
  }
}

app.http("controlRequirements", {
  methods: ["POST", "PATCH", "DELETE"],
  route: "control-requirements/{id?}",
  handler: async (request, context) => {
    const client = await pool.connect();
    try {
      const method = request.method;
      const id = request.params.id;

      if (method === "POST") {
        const body = await request.json();
        const result = await client.query(
          `INSERT INTO control_requirements (id, control_id, title, text, source_party, source_name, source_department, source_document)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [body.control_id, body.title ?? null, body.text,
           body.source_party ?? null, body.source_name ?? null,
           body.source_department ?? null, body.source_document ?? null]
        );
        await upsertSources(client, body);
        return { status: 201, jsonBody: { ok: true, data: result.rows[0] } };
      }

      if (method === "PATCH" && id) {
        const body = await request.json();
        const ALLOWED = new Set(["title", "text", "source_party", "source_name", "source_department", "source_document"]);
        const fields = [];
        const values = [];
        let i = 1;
        for (const [k, v] of Object.entries(body)) {
          if (!ALLOWED.has(k)) continue;
          fields.push(`${k} = $${i++}`);
          values.push(v);
        }
        if (fields.length === 0) return { status: 400, jsonBody: { ok: false, error: "No valid fields" } };
        values.push(id);
        await client.query(
          `UPDATE control_requirements SET ${fields.join(", ")}, updated_at = now() WHERE id = $${i}`,
          values
        );
        await upsertSources(client, body);
        return { status: 200, jsonBody: { ok: true } };
      }

      if (method === "DELETE" && id) {
        await client.query(`DELETE FROM control_requirements WHERE id = $1`, [id]);
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
