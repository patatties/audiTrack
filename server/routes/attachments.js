import { app } from "../router.js";
import { pool } from "../db.js";
import { deleteStoredFile, readStoredFile, storeFile } from "../storage.js";

// Flat routes (no slash) so they never clash with attachments/{id?}

app.http("attachment-upload", {
  methods: ["POST"],
  route: "attachment-upload",
  handler: async (request, context) => {
    const client = await pool.connect();
    try {
      const { planId, name, type, data } = await request.json();
      if (!planId || !data) {
        return { status: 400, jsonBody: { ok: false, error: "planId and data are required" } };
      }

      const buffer = Buffer.from(data, "base64");
      const contentType = type || "application/octet-stream";
      const filePath = await storeFile(`${planId}/${Date.now()}-${name ?? "file"}`, buffer);

      const result = await client.query(
        `INSERT INTO attachments (id, plan_id, file_name, file_path, mime_type, size_bytes)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5) RETURNING *`,
        [planId, name ?? "file", filePath, contentType, buffer.length]
      );

      return { status: 201, jsonBody: { ok: true, data: result.rows[0] } };
    } catch (error) {
      context.error(error);
      return { status: error.status ?? 500, jsonBody: { ok: false, error: error.message } };
    } finally {
      client.release();
    }
  },
});

app.http("attachment-upload-comment", {
  methods: ["POST"],
  route: "attachment-upload-comment",
  handler: async (request, context) => {
    const client = await pool.connect();
    try {
      const { planId, name, type, data } = await request.json();
      if (!planId || !data) {
        return { status: 400, jsonBody: { ok: false, error: "planId and data are required" } };
      }

      const buffer = Buffer.from(data, "base64");
      const contentType = type || "application/octet-stream";
      const filePath = await storeFile(
        `${planId}/comments/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${name ?? "pasted"}`,
        buffer
      );

      const result = await client.query(
        `INSERT INTO attachments (id, plan_id, file_name, file_path, mime_type, size_bytes)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5) RETURNING id`,
        [planId, name ?? "pasted", filePath, contentType, buffer.length]
      );

      const id = result.rows[0].id;
      return { status: 200, jsonBody: { ok: true, id, name, type: contentType } };
    } catch (error) {
      context.error(error);
      return { status: error.status ?? 500, jsonBody: { ok: false, error: error.message } };
    } finally {
      client.release();
    }
  },
});

app.http("attachment-download", {
  methods: ["GET"],
  route: "attachment-download/{id}",
  handler: async (request, context) => {
    const client = await pool.connect();
    try {
      const { id } = request.params;
      const row = await client.query(
        `SELECT file_path, file_name, mime_type FROM attachments WHERE id = $1`, [id]
      );
      if (!row.rows[0]) return { status: 404, jsonBody: { ok: false, error: "Not found" } };

      const { file_path, file_name, mime_type } = row.rows[0];
      const buffer = await readStoredFile(file_path);
      const contentType = mime_type || "application/octet-stream";
      const isInline = contentType.startsWith("image/") || contentType === "application/pdf";
      const safeName = String(file_name).replace(/["\\\r\n]/g, "_");

      return {
        status: 200,
        body: buffer,
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `${isInline ? "inline" : "attachment"}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(file_name)}`,
          "Content-Length": String(buffer.length),
        },
      };
    } catch (error) {
      context.error(error);
      return { status: error.status ?? 500, jsonBody: { ok: false, error: error.message } };
    } finally {
      client.release();
    }
  },
});

app.http("attachments", {
  methods: ["DELETE"],
  route: "attachments/{id?}",
  handler: async (request, context) => {
    const client = await pool.connect();
    try {
      const id = request.params.id;

      if (id) {
        const row = await client.query(`SELECT file_path FROM attachments WHERE id = $1`, [id]);
        if (row.rows[0]?.file_path) await deleteStoredFile(row.rows[0].file_path);
        await client.query(`DELETE FROM attachments WHERE id = $1`, [id]);
      } else {
        const body = await request.json().catch(() => ({}));
        if (body.plan_id) {
          const rows = await client.query(`SELECT file_path FROM attachments WHERE plan_id = $1`, [body.plan_id]);
          await Promise.all(rows.rows.map((r) => deleteStoredFile(r.file_path)));
          await client.query(`DELETE FROM attachments WHERE plan_id = $1`, [body.plan_id]);
        } else {
          return { status: 400, jsonBody: { ok: false, error: "Need id or plan_id" } };
        }
      }

      return { status: 200, jsonBody: { ok: true } };
    } catch (error) {
      context.error(error);
      return { status: error.status ?? 500, jsonBody: { ok: false, error: error.message } };
    } finally {
      client.release();
    }
  },
});
