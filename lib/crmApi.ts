"use client";

/* ── Typed REST client for the CRM backend ──
   Throws an ApiError carrying the server's message + code on any non-ok
   response, so callers stay uniform: try the API, catch → toast, with a
   demo-mode local fallback when the backend was never reached. */

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function apiCall<T>(url: string, method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; code?: string } & T;
  if (!response.ok || !payload.ok) {
    throw new ApiError(payload.error || `Request failed (${response.status})`, response.status, payload.code);
  }
  return payload;
}

