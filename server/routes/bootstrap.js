import { app } from "../router.js";

import { pool } from "../db.js";

async function query(client, sql) {
  const result = await client.query(sql);
  return result.rows;
}

app.http("bootstrap", {
  methods: ["GET"],
  route: "bootstrap",
  handler: async (request, context) => {
    const client = await pool.connect();

    try {

      const [
        clients,
        locations,
        control_catalog,
        controls,
        control_locations,
        findings,
        remediation_plans,
        remediation_plan_findings,
        comments,
        attachments,
        notes,
        solutions,
        solution_controls,
        solution_remediations,
        control_requirements,
        requirement_sources
      ] = await Promise.all([
        query(client, "select * from clients order by name"),
        query(client, "select * from locations order by name"),
        query(client, "select * from control_catalog order by code nulls last, name"),
        query(client, "select * from controls order by name"),
        query(client, "select * from control_locations"),
        query(client, "select * from findings order by position nulls last, created_at"),
        query(client, "select * from remediation_plans order by code nulls last, created_at"),
        query(client, "select * from remediation_plan_findings"),
        query(client, "select * from comments order by created_at desc limit 200"),
        query(client, "select * from attachments order by created_at desc"),
        query(client, "select * from notes order by updated_at desc"),
        query(client, "select * from solutions order by title"),
        query(client, "select * from solution_controls"),
        query(client, "select * from solution_remediations"),
        query(client, "select * from control_requirements order by created_at"),
        query(client, "select field, value from requirement_sources order by field, value")
      ]);

      // Natural order for control codes: A.5.2 before A.5.10, PR-2 before PR-10. Items without a code last.
      const natural = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
      control_catalog.sort((a, b) =>
        a.code && b.code ? natural.compare(a.code, b.code) : a.code ? -1 : b.code ? 1 : natural.compare(a.name, b.name)
      );

      return {
        status: 200,
        jsonBody: {
          ok: true,
          data: {
            clients,
            locations,
            control_catalog,
            controls,
            control_locations,
            findings,
            remediation_plans,
            remediation_plan_findings,
            comments,
            attachments,
            notes,
            solutions,
            solution_controls,
            solution_remediations,
            control_requirements,
            requirement_sources
          }
        }
      };
    } catch (error) {
      context.error(error);

      return {
        status: 500,
        jsonBody: {
          ok: false,
          error: "Bootstrap query failed",
          errorMessage: error?.message,
          errorCode: error?.code
        }
      };
    } finally {
      client.release();
    }
  }
});
