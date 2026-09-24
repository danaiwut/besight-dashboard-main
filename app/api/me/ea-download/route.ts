import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/server/prisma";
import { readEaPolicy } from "@/lib/server/eaPolicy";
import { actorFromSession, memberScopeGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

/** The current EA policy the member must accept before downloading. */
export async function GET() {
  const guard = await memberScopeGuard();
  if (!guard.ok) return guard.response;
  try {
    const policy = await readEaPolicy();
    return NextResponse.json({ ok: true, policy: { text: policy.text, version: policy.version } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load EA policy" }, { status: 500 });
  }
}

/** Accept the policy and receive the EA link. The link is only released when
 *  the member holds live access to that indicator and accepted the policy
 *  version currently in force; every release is logged (who, which indicator,
 *  policy version + text snapshot, time, IP, browser) as the acceptance record. */
export async function POST(request: NextRequest) {
  const guard = await memberScopeGuard();
  if (!guard.ok) return guard.response;
  try {
    const body = (await request.json()) as { indicatorId?: unknown; policyVersion?: unknown; accepted?: unknown };
    const indicatorId = Number(body.indicatorId);
    if (!Number.isInteger(indicatorId) || indicatorId <= 0) return NextResponse.json({ ok: false, error: "Invalid indicator" }, { status: 400 });
    if (body.accepted !== true) return NextResponse.json({ ok: false, error: "You must accept the EA policy first", code: "policy_required" }, { status: 400 });

    const prisma = getPrisma();
    const [policy, access, member] = await Promise.all([
      readEaPolicy(),
      prisma.memberIndicatorAccess.findUnique({
        where: { memberId_indicatorId: { memberId: guard.memberId, indicatorId } },
        include: { indicator: true },
      }),
      prisma.member.findUnique({ where: { id: guard.memberId }, select: { name: true, code: true, email: true } }),
    ]);
    if (Number(body.policyVersion) !== policy.version) {
      // The admin changed the wording after the member opened the dialog.
      return NextResponse.json({ ok: false, error: "The EA policy was updated — please review it again", code: "policy_changed" }, { status: 409 });
    }
    if (!access || access.status !== "active" || access.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ ok: false, error: "Your access to this indicator is not active" }, { status: 403 });
    }
    const url = access.indicator.eaFileUrl;
    if (!url) return NextResponse.json({ ok: false, error: "No EA download is available for this indicator" }, { status: 404 });

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
    const userAgent = (request.headers.get("user-agent") || "unknown").slice(0, 300);
    await prisma.activityLog.create({
      data: {
        memberId: guard.memberId,
        actor: actorFromSession(guard.user).slice(0, 96),
        action: "EA Policy Accepted",
        description: [
          `Member ${member?.name ?? ""} (${member?.code ?? `#${guard.memberId}`}, ${member?.email ?? ""}) accepted EA policy v${policy.version} and downloaded the EA for ${access.indicator.name}.`,
          `Accepted at: ${new Date().toISOString()} · IP: ${ip} · Browser: ${userAgent}`,
          `Policy text accepted:\n${policy.text}`,
        ].join("\n"),
        notification: false,
      },
    });
    return NextResponse.json({ ok: true, url });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to release the EA download" }, { status: 500 });
  }
}
