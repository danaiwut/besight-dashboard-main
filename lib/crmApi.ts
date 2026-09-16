"use client";

/* ── Typed REST client for the CRM backend ──
   Throws an Error carrying the server's message on any non-ok response, so
   callers stay uniform: try the API, catch → toast, with a demo-mode local
   fallback when the backend was never reached. */

export async function apiCall<T>(url: string, method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as { ok?: boolean; error?: string } & T;
  if (!response.ok || !payload.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}
