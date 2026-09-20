import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/* ── Reversible secret storage (investor passwords) ──
    Unlike sign-in passwords (one-way scrypt hash), an investor password must
    be readable again later by the future MT live-sync — so it is encrypted
    with AES-256-GCM, never stored plain. Key from JOURNAL_SECRET (or the
    AUTH_SECRET fallback). Plaintext never leaves the server. */

function encryptionKey(): Buffer {
  const secret = process.env.JOURNAL_SECRET || process.env.AUTH_SECRET;
  if (!secret) throw new Error("JOURNAL_SECRET (or AUTH_SECRET) is not configured");
  return scryptSync(secret, "journal-investor-v1", 32);
}

/** Encrypts to `iv:tag:cipher` (base64). Throws on empty input. */
export function encryptSecret(plain: string): string {
  if (!plain) throw new Error("Nothing to encrypt");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Invalid secret payload");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}
