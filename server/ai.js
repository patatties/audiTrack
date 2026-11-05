/**
 * One place for all AI calls (assistant, translation, summaries, AI setup).
 * Providers are called with plain fetch; keys come only from environment variables.
 *
 *   Azure OpenAI  AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_DEPLOYMENT + AZURE_OPENAI_API_KEY
 *                 (OPENAI_API_KEY is still accepted as the Azure key, as in older setups)
 *   Anthropic     ANTHROPIC_API_KEY   [ANTHROPIC_MODEL, default claude-opus-5-5]
 *   OpenAI        OPENAI_API_KEY      [OPENAI_MODEL, default gpt-4.1]
 *   OpenRouter    OPENROUTER_API_KEY + OPENROUTER_MODEL
 *   Ollama        OLLAMA_BASE_URL + OLLAMA_MODEL
 *
 * AI_PROVIDER picks one (azure, anthropic, openai, openrouter, ollama); empty = the first
 * configured provider in that order. AI_MODEL overrides the provider's model.
 */

const env = (k) => (process.env[k] ?? "").trim();

function providers() {
  const azureKey = env("AZURE_OPENAI_API_KEY") || (env("AZURE_OPENAI_ENDPOINT") ? env("OPENAI_API_KEY") : "");
  // When Azure uses OPENAI_API_KEY as its key, that key is not a standard OpenAI key.
  const openaiKey = env("AZURE_OPENAI_ENDPOINT") && !env("AZURE_OPENAI_API_KEY") ? "" : env("OPENAI_API_KEY");
  return [
    { id: "azure", label: "Azure OpenAI", key: azureKey, configured: !!(azureKey && env("AZURE_OPENAI_ENDPOINT") && env("AZURE_OPENAI_DEPLOYMENT")), model: env("AZURE_OPENAI_DEPLOYMENT") },
    { id: "anthropic", label: "Anthropic (Claude)", key: env("ANTHROPIC_API_KEY"), configured: !!env("ANTHROPIC_API_KEY"), model: env("ANTHROPIC_MODEL") || "claude-opus-5-5" },
    { id: "openai", label: "OpenAI", key: openaiKey, configured: !!openaiKey, model: env("OPENAI_MODEL") || "gpt-4.1" },
    { id: "openrouter", label: "OpenRouter", key: env("OPENROUTER_API_KEY"), configured: !!(env("OPENROUTER_API_KEY") && (env("OPENROUTER_MODEL") || env("AI_MODEL"))), model: env("OPENROUTER_MODEL") },
    { id: "ollama", label: "Ollama", baseUrl: env("OLLAMA_BASE_URL").replace(/\/+$/, ""), configured: !!(env("OLLAMA_BASE_URL") && (env("OLLAMA_MODEL") || env("AI_MODEL"))), model: env("OLLAMA_MODEL") },
  ];
}

/** The provider used for all AI features, or null when none is configured. */
export function aiProvider() {
  const list = providers();
  const wanted = env("AI_PROVIDER").toLowerCase();
  const p = wanted ? list.find((x) => x.id === wanted && x.configured) : list.find((x) => x.configured);
  if (!p) return null;
  return { ...p, model: env("AI_MODEL") || p.model };
}

export function aiConfigured() {
  return aiProvider() !== null;
}

export function aiNotConfiguredMessage() {
  const wanted = env("AI_PROVIDER");
  return wanted
    ? `AI provider "${wanted}" is not fully configured. See .env.example.`
    : "No AI provider configured. Set one in .env (Anthropic, OpenAI, Azure OpenAI, OpenRouter or Ollama).";
}

async function readError(res) {
  const text = await res.text().catch(() => "");
  return `AI service error ${res.status}: ${text.slice(0, 500)}`;
}

/**
 * Sends chat messages ({ role: "system" | "user" | "assistant", content }) and returns the answer text.
 * maxTokens null = let the provider decide (Anthropic needs a value and gets 16000).
 */
export async function callChatCompletion(messages, maxTokens = 1000) {
  const p = aiProvider();
  if (!p) throw new Error(aiNotConfiguredMessage());

  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const chat = messages.filter((m) => m.role !== "system");

  if (p.id === "azure") {
    const endpoint = env("AZURE_OPENAI_ENDPOINT");
    const isResponsesApi = endpoint.includes("/responses");
    const isDeploymentsApi = endpoint.includes("/deployments/");
    const url = isResponsesApi || isDeploymentsApi
      ? endpoint
      : `${endpoint.replace(/\/$/, "")}/openai/deployments/${p.model}/chat/completions?api-version=2024-08-01-preview`;
    const body = isResponsesApi
      ? { model: p.model, input: messages }
      : { messages, ...(maxTokens ? { max_tokens: maxTokens } : {}) };
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "api-key": p.key }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(await readError(res));
    const data = await res.json();
    return isResponsesApi
      ? (data.output?.[0]?.content?.[0]?.text?.trim() ?? "")
      : (data.choices?.[0]?.message?.content?.trim() ?? "");
  }

  if (p.id === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": p.key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: p.model,
        max_tokens: Math.max(maxTokens ?? 16000, 4000),
        ...(system ? { system } : {}),
        messages: chat.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content) })),
      }),
    });
    if (!res.ok) throw new Error(await readError(res));
    const data = await res.json();
    if (data.stop_reason === "refusal") throw new Error("The AI declined this request.");
    return (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  }

  if (p.id === "openai" || p.id === "openrouter") {
    const url = p.id === "openai" ? "https://api.openai.com/v1/chat/completions" : "https://openrouter.ai/api/v1/chat/completions";
    const tokens = maxTokens ? (p.id === "openai" ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }) : {};
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json", ...(p.id === "openrouter" ? { "X-Title": "audiTrack" } : {}) },
      body: JSON.stringify({ model: p.model, messages, ...tokens }),
    });
    if (!res.ok) throw new Error(await readError(res));
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() ?? "";
  }

  // Ollama (local)
  const res = await fetch(`${p.baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: p.model, stream: false, options: { num_ctx: 32768 }, messages }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  return data.message?.content?.trim() ?? "";
}
