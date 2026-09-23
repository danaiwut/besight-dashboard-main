import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

/* ── CRM gate: a second, shared password in front of /crm ──
   The admin still signs in with their own account first (so the audit
   trail keeps working); afterwards every /crm page AND every /api/crm/*
   call additionally requires this gate to be unlocked. The unlock is a
   deterministic HMAC token (secret + gate password) kept in an httpOnly
   cookie — nothing brute-forceable is stored client-side, and changing
   the password (or the signing secret) instantly kills every cookie. */

export const CRM_GATE_COOKIE = "bs_crm_gate";
/** Unlock lasts 12 hours — long enough for a workday, short enough that a
 *  shared workstation doesn't stay open forever. */
export const CRM_GATE_MAX_AGE = 60 * 60 * 12;

function gatePassword(): string {
  return process.env.CRM_GATE_PASSWORD?.trim() || "";
}

function gateSecret(): string {
  return process.env.GATE_SECRET || process.env.AUTH_SECRET || "";
}

/** The gate only exists when a password is configured. Without one the CRM
 *  behaves exactly as before (admin session is enough). */
export function isCrmGateConfigured(): boolean {
  return gatePassword().length > 0 && gateSecret().length > 0;
}

function expectedToken(): Buffer | null {
  const password = gatePassword();
  const secret = gateSecret();
  if (!password || !secret) return null;
  return createHmac("sha256", secret).update(`crm-gate:${password}`, "utf8").digest();
}

/** Constant-time password check — callers must not reveal which half failed. */
export function verifyGatePassword(input: string): boolean {
  const password = gatePassword();
  if (!password || !input) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(password);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function hasCrmGateAccess(): Promise<boolean> {
  const expected = expectedToken();
  if (!expected) return false;
  const raw = (await cookies()).get(CRM_GATE_COOKIE)?.value;
  if (!raw) return false;
  let actual: Buffer;
  try {
    actual = Buffer.from(raw, "hex");
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/** Cookie value to set after a successful unlock (null when unconfigured). */
export function crmGateCookieValue(): string | null {
  const token = expectedToken();
  return token ? token.toString("hex") : null;
}
