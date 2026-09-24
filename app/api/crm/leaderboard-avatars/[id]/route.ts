import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { toAvatarOptionDto } from "@/lib/server/avatarCatalog";
import { actorFromSession, adminWriteGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

async function idOf(params: Promise<{ id: string }>) {
  const id = Number((await params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Rename, show/hide or reorder an avatar: { label?, active?, sortOrder? }. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const id = await idOf(params);
    if (!id) return NextResponse.json({ ok: false, error: "Invalid avatar id" }, { status: 400 });
    const body = (await request.json()) as { label?: unknown; active?: unknown; sortOrder?: unknown };
    const data: { label?: string; active?: boolean; sortOrder?: number } = {};
    if (body.label !== undefined) data.label = String(body.label).trim().slice(0, 96) || "Avatar";
    if (typeof body.active === "boolean") data.active = body.active;
    if (body.sortOrder !== undefined && Number.isInteger(Number(body.sortOrder))) data.sortOrder = Number(body.sortOrder);
    const row = await getPrisma().leaderboardAvatarOption.update({ where: { id }, data });
    return NextResponse.json({ ok: true, option: toAvatarOptionDto(row) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to update avatar" }, { status: 400 });
  }
}

/** Delete an uploaded avatar. Built-ins can only be hidden. Members who had
 *  picked it fall back to their initials. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const id = await idOf(params);
    if (!id) return NextResponse.json({ ok: false, error: "Invalid avatar id" }, { status: 400 });
    const prisma = getPrisma();
    const row = await prisma.leaderboardAvatarOption.findUnique({ where: { id }, select: { builtIn: true, label: true } });
    if (!row) return NextResponse.json({ ok: false, error: "Avatar not found" }, { status: 404 });
    if (row.builtIn) return NextResponse.json({ ok: false, error: "Built-in avatars can be hidden but not deleted" }, { status: 400 });
    await prisma.leaderboardAvatarOption.delete({ where: { id } });
    await prisma.activityLog.create({
      data: { actor: actorFromSession(guard.user).slice(0, 96), action: "Leaderboard Avatar Deleted", description: `Deleted leaderboard avatar "${row.label}" (#${id}).`, notification: false },
    });
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to delete avatar" }, { status: 400 });
  }
}
