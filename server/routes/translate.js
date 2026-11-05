import { app } from "../router.js";
import { callChatCompletion } from "../ai.js";

app.http("translate", {
  methods: ["POST"],
  route: "translate",
  handler: async (request, context) => {
    try {
      const { text } = await request.json();
      if (!text?.trim()) {
        return { status: 400, jsonBody: { ok: false, error: "No text provided" } };
      }

      const translation = await callChatCompletion([
        {
          role: "system",
          content:
            "You are a professional translator. Translate the given text to English. " +
            "Preserve the original tone, style, and register — if the source is formal, stay formal; " +
            "if casual, stay casual. Output only the translated text, nothing else.",
        },
        { role: "user", content: text },
      ], 1000);

      return { status: 200, jsonBody: { ok: true, translation } };
    } catch (error) {
      context.error(error);
      return { status: 500, jsonBody: { ok: false, error: error.message } };
    }
  },
});
