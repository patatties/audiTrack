// Calls the REST handlers in-process, so MCP tools use exactly the same logic as the web app.
import { invoke } from "./router.js";

export class ApiCallError extends Error {}

/** Calls METHOD /api/<path> and returns jsonBody; throws ApiCallError on a 4xx/5xx or { ok: false }. */
export async function callApi(method, path, body, actor = "") {
  const headers = new Headers({ "content-type": "application/json" });
  if (actor) headers.set("x-auditrack-actor", encodeURIComponent(actor));
  const result = await invoke(method, path, { body, headers });
  const status = result.status ?? 200;
  const data = result.jsonBody;
  if (status >= 400 || data?.ok === false) {
    throw new ApiCallError(data?.error || data?.errorMessage || `API error ${status}`);
  }
  return data;
}

/** All data as the web app sees it (GET /api/bootstrap). */
export async function loadAll() {
  return (await callApi("GET", "bootstrap")).data;
}
