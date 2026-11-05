import { app } from "../router.js";
import { pool } from "../db.js";

// Health check for Docker and monitoring: reports whether the database answers.
app.http("health", {
  methods: ["GET"],
  route: "health",
  handler: async () => {
    try {
      await pool.query("SELECT 1");
      return { status: 200, jsonBody: { ok: true, database: "ok" } };
    } catch (error) {
      return { status: 503, jsonBody: { ok: false, database: "unavailable", error: error.message } };
    }
  },
});
