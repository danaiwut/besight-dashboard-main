import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getPrisma } from "./prisma";

/* ── Social account linking (member-verified) ──
    Telegram Login Widget, Discord OAuth2 and LINE Login share one flow:
    start (signed state → provider) → callback (verify → link). Secrets live
    in env (never the DB); only invite links are admin-editable in settings. */

export type SocialProvider = "telegram" | "discord" | "line";
export const SOCIAL_PROVIDERS: SocialProvider[] = ["telegram", "discord", "line"];

const STATE_TTL_MS = 10 * 60 * 1000;

function secret(): string {
  const secretValue = process.env.AUTH_SECRET;
  if (!secretValue) throw new Error("AUTH_SECRET is not configured");
  return secretValue;
}

function base64urlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64urlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

/** Tamper-proof, expiring state for the OAuth round-trip. Binds the provider
 *  to the member who clicked Connect — the callback rejects anything else. */
export function signLinkState(memberId: number, provider: SocialProvider): string {
  const payload = JSON.stringify({
    memberId,
    provider,
    nonce: randomBytes(12).toString("hex"),
    exp: Date.now() + STATE_TTL_MS,
  });
  const encoded = base64urlEncode(payload);
  const signature = createHmac("sha256", secret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyLinkState(state: string, memberId: number): SocialProvider | null {
  try {
    const [encoded, signature] = state.split(".");
    if (!encoded || !signature) return null;
    const expected = createHmac("sha256", secret()).update(encoded).digest();
    const actual = Buffer.from(signature, "base64url");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const payload = JSON.parse(base64urlDecode(encoded)) as { memberId?: number; provider?: string; exp?: number };
    if (payload.memberId !== memberId || typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return SOCIAL_PROVIDERS.includes(payload.provider as SocialProvider) ? (payload.provider as SocialProvider) : null;
  } catch {
    return null;
  }
}

export type SocialIdentity = { providerUserId: string; username: string | null };

// ── Telegram Login Widget ───────────────────────────────────────────────
// https://core.telegram.org/widgets/login — the widget sends id, first_name,
// username, auth_date + hash. hash = hex(HMAC_SHA256(data_check_string,
// SHA256(bot_token))), data_check_string = sorted "k=v" lines joined by \n.

export function verifyTelegramLogin(params: Record<string, string | undefined>): SocialIdentity | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  const { hash, ...rest } = params;
  const id = rest.id?.trim();
  if (!hash || !id) return null;
  const dataCheckString = Object.entries(rest)
    .filter(([, value]) => value != null && value !== "")
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join("\n");
  const secretKey = createHash("sha256").update(botToken).digest();
  const expected = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  // Reject stale logins (older than a day).
  const authDate = Number(rest.auth_date);
  if (!Number.isFinite(authDate) || Date.now() / 1000 - authDate > 86400) return null;
  const username = rest.username?.trim() || rest.first_name?.trim() || null;
  return { providerUserId: id, username };
}

// ── Discord OAuth2 ──────────────────────────────────────────────────────

function discordConfig() {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("DISCORD_CLIENT_ID/SECRET is not configured");
  return { clientId, clientSecret };
}

export function discordAuthorizeUrl(baseUrl: string, state: string): string {
  const { clientId } = discordConfig();
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", `${baseUrl}/api/social/discord/callback/`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "identify");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

export async function exchangeDiscordCode(baseUrl: string, code: string): Promise<SocialIdentity> {
  const { clientId, clientSecret } = discordConfig();
  const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: `${baseUrl}/api/social/discord/callback/`,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!tokenResponse.ok) throw new Error("Discord token exchange failed");
  const token = (await tokenResponse.json()) as { access_token?: string };
  if (!token.access_token) throw new Error("Discord token exchange failed");
  const userResponse = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${token.access_token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!userResponse.ok) throw new Error("Unable to read Discord profile");
  const user = (await userResponse.json()) as { id?: string; username?: string; global_name?: string | null };
  if (!user.id) throw new Error("Unable to read Discord profile");
  return { providerUserId: user.id, username: user.global_name || user.username || null };
}

// ── LINE Login (link-only flow, separate from sign-in) ─────────────────

function lineConfig() {
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID || process.env.LINE_CLIENT_ID;
  const channelSecret = process.env.LINE_LOGIN_CHANNEL_SECRET || process.env.LINE_CLIENT_SECRET;
  if (!channelId || !channelSecret) throw new Error("LINE_LOGIN_CHANNEL_ID/SECRET is not configured");
  return { channelId, channelSecret };
}

export function lineAuthorizeUrl(baseUrl: string, state: string): string {
  const { channelId } = lineConfig();
  const url = new URL("https://access.line.me/oauth2/v2.1/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", channelId);
  url.searchParams.set("redirect_uri", `${baseUrl}/api/social/line/callback/`);
  url.searchParams.set("scope", "profile openid");
  url.searchParams.set("state", state);
  return url.toString();
}

/** Verifies the HS256 id_token signature with the channel secret and
 *  returns the subject + display name. */
export function verifyLineIdToken(idToken: string): SocialIdentity {
  const { channelId, channelSecret } = lineConfig();
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Invalid LINE id_token");
  const [header, payload, signature] = parts;
  const expected = createHmac("sha256", channelSecret).update(`${header}.${payload}`).digest();
  const actual = Buffer.from(signature.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error("Invalid LINE id_token signature");
  }
  const claims = JSON.parse(base64urlDecode(payload)) as { sub?: string; name?: string; aud?: string; exp?: number };
  if (!claims.sub || claims.aud !== channelId) throw new Error("Invalid LINE id_token claims");
  if (typeof claims.exp === "number" && claims.exp * 1000 < Date.now()) throw new Error("Expired LINE id_token");
  return { providerUserId: claims.sub, username: claims.name || null };
}

export async function exchangeLineCode(baseUrl: string, code: string): Promise<SocialIdentity> {
  const { channelId, channelSecret } = lineConfig();
  const tokenResponse = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${baseUrl}/api/social/line/callback/`,
      client_id: channelId,
      client_secret: channelSecret,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!tokenResponse.ok) throw new Error("LINE token exchange failed");
  const token = (await tokenResponse.json()) as { id_token?: string };
  if (!token.id_token) throw new Error("LINE login returned no profile");
  return verifyLineIdToken(token.id_token);
}

// ── Linking ─────────────────────────────────────────────────────────────

const DISPLAY_COLUMNS: Record<SocialProvider, { id: "telegramUserId" | "discordUserId" | "lineUserId"; name: "telegramUsername" | "discordUsername" | "lineDisplayName" }> = {
  telegram: { id: "telegramUserId", name: "telegramUsername" },
  discord: { id: "discordUserId", name: "discordUsername" },
  line: { id: "lineUserId", name: "lineDisplayName" },
};

/** Upserts the verified link and mirrors the display copy onto the member row
 *  (keeps the CRM sync + TelegramAccess derivation working). One provider
 *  account belongs to a single member — re-linking moves it. */
export async function linkSocialAccount(memberId: number, provider: SocialProvider, identity: SocialIdentity) {
  const prisma = getPrisma();
  const columns = DISPLAY_COLUMNS[provider];
  await prisma.$transaction(async (tx) => {
    await tx.socialAccount.deleteMany({ where: { provider, providerUserId: identity.providerUserId, NOT: { memberId } } });
    await tx.socialAccount.upsert({
      where: { memberId_provider: { memberId, provider } },
      update: { providerUserId: identity.providerUserId, username: identity.username, verifiedAt: new Date() },
      create: { memberId, provider, providerUserId: identity.providerUserId, username: identity.username },
    });
    await tx.member.update({
      where: { id: memberId },
      data: { [columns.id]: identity.providerUserId, [columns.name]: identity.username },
    });
    await tx.activityLog.create({
      data: {
        memberId,
        actor: "Member",
        action: "Social Connected",
        description: `${provider} linked${identity.username ? ` as ${identity.username}` : ""}.`,
      },
    });
  });
}

export async function unlinkSocialAccount(memberId: number, provider: SocialProvider) {
  const prisma = getPrisma();
  const columns = DISPLAY_COLUMNS[provider];
  await prisma.$transaction(async (tx) => {
    await tx.socialAccount.deleteMany({ where: { memberId, provider } });
    await tx.member.update({
      where: { id: memberId },
      data: { [columns.id]: null, [columns.name]: null },
    });
    await tx.activityLog.create({
      data: { memberId, actor: "Member", action: "Social Disconnected", description: `${provider} unlinked.` },
    });
  });
}

export async function socialStatusFor(memberId: number): Promise<Record<SocialProvider, { linked: boolean; username: string | null; verifiedAt: string | null }>> {
  const rows = await getPrisma().socialAccount.findMany({ where: { memberId } });
  const byProvider = new Map(rows.map((row) => [row.provider, row]));
  return {
    telegram: linkStatus(byProvider.get("telegram")),
    discord: linkStatus(byProvider.get("discord")),
    line: linkStatus(byProvider.get("line")),
  };
}

function linkStatus(row: { username: string | null; verifiedAt: Date } | undefined) {
  return { linked: Boolean(row), username: row?.username ?? null, verifiedAt: row ? row.verifiedAt.toISOString() : null };
}
