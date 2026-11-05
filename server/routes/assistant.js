import { app } from "../router.js";
import { AssistantError, assistantConfig, chatDecision, chatMessage } from "../assistant.js";

// AI assistant: GET assistant/config, POST assistant/message, POST assistant/decision.
app.http("assistant", {
  methods: ["GET", "POST"],
  route: "assistant/{action}",
  handler: async (request, context) => {
    try {
      const action = request.params.action;
      if (request.method === "GET" && action === "config") return { status: 200, jsonBody: { ok: true, data: assistantConfig() } };
      if (request.method === "POST" && action === "message") return { status: 200, jsonBody: { ok: true, data: await chatMessage(await request.json()) } };
      if (request.method === "POST" && action === "decision") return { status: 200, jsonBody: { ok: true, data: await chatDecision(await request.json()) } };
      return { status: 404, jsonBody: { ok: false, error: "Not found" } };
    } catch (error) {
      if (error instanceof AssistantError) return { status: error.status, jsonBody: { ok: false, error: error.message } };
      if (error instanceof SyntaxError) return { status: 400, jsonBody: { ok: false, error: "Invalid JSON body" } };
      context.error(error);
      return { status: 500, jsonBody: { ok: false, error: error.message } };
    }
  },
});
