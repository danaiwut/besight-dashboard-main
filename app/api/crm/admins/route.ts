import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { toAdminDto } from "@/lib/server/crmDtos";
import { adminSettingsGuard } from "@/lib/session";
import { createAdminClaimToken, ADMIN_CLAIM_TOKEN_TTL_HOURS } from "@/lib/server/adminClaim";
import { adminClaimEmail, isEmailConfigured, sendEmail } from "@/lib/server/email";


export const dynamic = "force-dynamic";

const ROLES = ["Admin", "Support", "Viewer"];

export async function GET() {
  const guard = await adminSettingsGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const records = await getPrisma().admin.findMany({ orderBy: { id: "asc" } });
    // Never expose passwordHash to the browser — only the fields the CRM UI needs.
    return NextResponse.json({ ok: true, admins: records.map(toAdminDto) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load Admins" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await adminSettingsGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const role = String(body.role || "Support");
    if (!ROLES.includes(role)) return NextResponse.json({ ok: false, error: `Role must be one of: ${ROLES.join(", ")}` }, { status: 400 });

    const prisma = getPrisma();

    // Two ways in: pick an existing member (the common case — promotes a
    // known user to admin, keeping the admin row's identity tied to the
    // account they'll actually recognize), or type a brand-new name/email
    // for someone who isn't a member (e.g. internal staff with no customer
    // account). Either way this only ever creates a new Admin row — never
    // touches the Member row itself, since Admin/Member are deliberately
    // separate credentials (see auth.ts).
    let name: string;
    let email: string;
    const memberId = Number(body.memberId) || 0;
    if (memberId > 0) {
      const member = await prisma.member.findUnique({ where: { id: memberId }, select: { name: true, displayName: true, email: true } });
      if (!member) return NextResponse.json({ ok: false, error: "Member not found" }, { status: 404 });
      if (!member.email) return NextResponse.json({ ok: false, error: "This member has no email on file" }, { status: 400 });
      name = member.displayName?.trim() || member.name;
      email = member.email;
    } else {
      name = String(body.name || "").trim();
      email = String(body.email || "").trim();
      if (!name || !email) return NextResponse.json({ ok: false, error: "Name and email are required" }, { status: 400 });
    }

    if (await prisma.admin.findUnique({ where: { email }, select: { id: true } })) {
      return NextResponse.json({ ok: false, error: "Email already exists" }, { status: 400 });
    }

    const admin = await prisma.admin.create({ data: { name, email, role, isOwner: false } });
    await bumpDataVersion();

    // A new admin has no password yet (Admin/Member are separate
    // credentials, so a linked member's password doesn't carry over) — mint
    // a setup link the same way /claim does for members, email it, and also
    // hand it back in the response so the inviting admin can share it by
    // hand if email isn't configured or delivery is uncertain.
    const token = await createAdminClaimToken(admin.id);
    const setupLink = `${request.nextUrl.origin}/admin-claim/?token=${encodeURIComponent(token)}`;
    let emailSent = false;
    if (isEmailConfigured()) {
      try {
        const message = adminClaimEmail(name, setupLink, ADMIN_CLAIM_TOKEN_TTL_HOURS);
        await sendEmail({ to: email, ...message });
        emailSent = true;
      } catch {
        // Swallowed deliberately: the admin row is already created and the
        // link is returned below either way, so a delivery hiccup here
        // doesn't block the operation — the inviting admin can just copy
        // the link themselves.
      }
    }

    return NextResponse.json({ ok: true, admin: toAdminDto(admin), setupLink, emailSent });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to create admin" }, { status: 400 });
  }
}
