import { app } from "../router.js";

import { pool } from "../db.js";

app.http("remediationPlanFindings", {
  methods: ["POST", "DELETE"],
  route: "remediation-plan-findings",
  handler: async (request, context) => {
    const client = await pool.connect();
    try {
      const method = request.method;

      if (method === "POST") {
        const body = await request.json();
        await client.query(
          `INSERT INTO remediation_plan_findings (plan_id, finding_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [body.plan_id, body.finding_id]
        );
        return { status: 201, jsonBody: { ok: true } };
      }

      if (method === "DELETE") {
        const body = await request.json();
        if (body.plan_id && body.finding_id) {
          await client.query(
            `DELETE FROM remediation_plan_findings WHERE plan_id = $1 AND finding_id = $2`,
            [body.plan_id, body.finding_id]
          );
        } else if (body.plan_id) {
          await client.query(`DELETE FROM remediation_plan_findings WHERE plan_id = $1`, [body.plan_id]);
        } else if (body.finding_id) {
          await client.query(`DELETE FROM remediation_plan_findings WHERE finding_id = $1`, [body.finding_id]);
        } else {
          return { status: 400, jsonBody: { ok: false, error: "Need plan_id or finding_id" } };
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
