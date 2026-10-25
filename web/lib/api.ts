export const MOCK = process.env.NEXT_PUBLIC_MOCK === "1";
export const API = process.env.NEXT_PUBLIC_API ?? "http://localhost:8080";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown[]) { super(message); }
}

// On serverless hosting every concurrent request can land on a different instance (and a different in-memory lab). One tab therefore sends API calls strictly one at a time.
let chain: Promise<unknown> = Promise.resolve();
const SERIAL = process.env.NEXT_PUBLIC_POLL === "1";
export function api<T = unknown>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  if (!SERIAL) return rawApi<T>(path, init);
  const p = chain.then(() => rawApi<T>(path, init), () => rawApi<T>(path, init));
  chain = p.catch(() => undefined);
  return p;
}
async function rawApi<T = unknown>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const headers: Record<string, string> = {};
  let body = init?.body;
  if (init?.json !== undefined) { headers["content-type"] = "application/json"; body = JSON.stringify(init.json); }
  if (MOCK) { const { mockApi } = await import("./mock"); return mockApi(path, init?.method ?? "GET", init?.json) as Promise<T>; }
  let res: Response;
  try { res = await fetch(API + path, { ...init, body, headers: { ...headers, ...(init?.headers as Record<string, string>) }, cache: "no-store" }); }
  catch { throw new ApiError(0, "offline", "Can't reach the TESSERA core. Is it running on " + API + "?"); }
  if (!res.ok) {
    let j: { error?: { code?: string; message?: string; details?: unknown[] } } = {};
    try { j = await res.json(); } catch {}
    throw new ApiError(res.status, j.error?.code ?? "error", j.error?.message ?? `Request failed (${res.status})`, j.error?.details);
  }
  const ct = res.headers.get("content-type") ?? "";
  return (ct.includes("json") ? res.json() : (res.text() as unknown)) as Promise<T>;
}
export const get = <T,>(p: string) => api<T>(p);
export const post = <T,>(p: string, json?: unknown) => api<T>(p, { method: "POST", json: json ?? {} });
export const put = <T,>(p: string, json?: unknown) => api<T>(p, { method: "PUT", json });
export const del = <T,>(p: string) => api<T>(p, { method: "DELETE" });
export const docPageUrl = (id: string, page: number) => (MOCK ? `/mock/doc_acme_q4-${Math.min(page, 3)}.png` : `${API}/documents/${id}/page/${page}.png`);
export const PDF_SCALE = 1.6; // bbox (PDF points) * PDF_SCALE = PNG pixels
