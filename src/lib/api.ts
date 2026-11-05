async function request(path: string, method: string, body?: unknown) {
  const res = await fetch(`/api/${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || err.message || `API error ${res.status}`);
  }
  return res.json();
}

export const apiGet = (path: string) => request(path, "GET");
export const apiPost = (path: string, body?: unknown) => request(path, "POST", body);
export const apiPatch = (path: string, body: unknown) => request(path, "PATCH", body);
export const apiDelete = (path: string, body?: unknown) => request(path, "DELETE", body);
