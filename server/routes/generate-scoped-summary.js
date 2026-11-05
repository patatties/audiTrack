import { app } from "../router.js";
import { callChatCompletion } from "../ai.js";

app.http("generateScopedSummary", {
  methods: ["POST"],
  route: "generate-scoped-summary",
  handler: async (request, context) => {
    try {
      const body = await request.json();
      const { scope, metrics, findings, plans } = body;

      const scopeLabel = scope.siteName
        ? `${scope.clientName} — ${scope.siteName}`
        : scope.clientName || "Full portfolio";

      const prompt = `Generate a concise management summary (3-5 sentences) for an audit report.

Scope: ${scopeLabel}
Total findings: ${metrics.totalFindings}, Open: ${metrics.open}, In progress: ${metrics.inProgress}, Done: ${metrics.done}
Open critical: ${metrics.openCritical}, Open high: ${metrics.openHigh}
Active remediation plans: ${metrics.plansOpen}, Total effort outstanding: ${metrics.totalEffortDays} days

Open findings:
${findings.slice(0, 10).map((f) => `- [${f.severity}] ${f.title}: ${f.description || "no description"}`).join("\n")}

Open plans:
${plans.slice(0, 5).map((p) => `- ${p.code ? p.code + " · " : ""}${p.title} (${p.status}, ${p.effort_days ?? "?"} days)`).join("\n")}

Write the summary in the same language as the findings titles. Be factual and professional.`;

      const summary = await callChatCompletion(
        [{ role: "user", content: prompt }],
        400,
      );

      return { status: 200, jsonBody: { ok: true, summary } };
    } catch (error) {
      context.error(error);
      return { status: 500, jsonBody: { ok: false, error: error.message } };
    }
  },
});
