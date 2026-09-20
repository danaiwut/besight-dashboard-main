import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/server/prisma";
import { socialStatusFor } from "@/lib/server/social";
import { readGeneralSettings } from "@/lib/server/generalSettings";
import { resolveMemberIdForUser } from "@/lib/server/authIdentity";
import { memberGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Link status for the three VIP channels + the Telegram bot name the Login
 *  Widget needs (null until TELEGRAM_BOT_USERNAME is configured). */
export async function GET() {
  const guard = await memberGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const memberId = await resolveMemberIdForUser(guard.user);
    if (!memberId) return NextResponse.json({ ok: false, error: "No member profile for this account" }, { status: 404 });
    const status = await socialStatusFor(memberId);
    const general = await readGeneralSettings();
    return NextResponse.json({
      ok: true,
      status,
      telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME || null,
      inviteLinks: {
        telegram: general.telegramInviteLink || null,
        discord: general.discordInviteLink || null,
        line: general.lineInviteLink || null,
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load social status" }, { status: 500 });
  }
}
