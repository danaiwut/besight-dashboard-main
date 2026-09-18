import { NextRequest, NextResponse } from "next/server";
import { ActivityStatus } from "@/generated/prisma/client";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { toActivityDto } from "@/lib/server/crmDtos";
import { adminWriteGuard } from "@/lib/session";


export const dynamic = "force-dynamic";

const STATUSES = ["upcoming", "live", "finished"] as const;

function fail(error: unknown, fallback: string, status = 400) {
  return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : fallback }, { status });
}

function optionalDate(value: unknown) {
  if (value == null || value === "") return undefined;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : new Date(`${parsed.toISOString().slice(0, 10)}T00:00:00Z`);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid activity id" }, { status: 400 });
    const prisma = getPrisma();
    const current = await prisma.activity.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ ok: false, error: "Activity not found" }, { status: 404 });

    const body = await request.json() as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (!title) return NextResponse.json({ ok: false, error: "Title is required" }, { status: 400 });
      data.title = title;
    }
    if (body.slug !== undefined) {
      const slug = String(body.slug).trim();
      if (slug) {
        const clash = await prisma.activity.findUnique({ where: { slug }, select: { id: true } });
        if (clash && clash.id !== id) return NextResponse.json({ ok: false, error: `Slug ${slug} is already used` }, { status: 400 });
        data.slug = slug;
      }
    }
    if (body.description !== undefined) data.description = String(body.description).trim() || null;
    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status as (typeof STATUSES)[number])) {
        return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });
      }
      data.status = body.status as ActivityStatus;
    }
    if (body.startDate !== undefined) {
      const startDate = optionalDate(body.startDate);
      if (!startDate) return NextResponse.json({ ok: false, error: "Invalid start date" }, { status: 400 });
      data.startDate = startDate;
    }
    if (body.endDate !== undefined) {
      const endDate = optionalDate(body.endDate);
      if (!endDate) return NextResponse.json({ ok: false, error: "Invalid end date" }, { status: 400 });
      data.endDate = endDate;
    }
    const nextStart = (data.startDate as Date | undefined) ?? current.startDate;
    const nextEnd = (data.endDate as Date | undefined) ?? current.endDate;
    if (nextStart > nextEnd) return NextResponse.json({ ok: false, error: "Start date must be on or before end date" }, { status: 400 });

    if (body.traders !== undefined) data.traders = Math.max(0, Math.floor(Number(body.traders) || 0));
    if (body.prizePool !== undefined) data.prizePool = Math.max(0, Number(body.prizePool) || 0);
    if (body.coverImage !== undefined) data.coverImage = String(body.coverImage).trim() || null;
    if (body.visibleFrom !== undefined) data.visibleFrom = optionalDate(body.visibleFrom) ?? null;
    if (body.registrationOpensAt !== undefined) data.registrationOpensAt = optionalDate(body.registrationOpensAt) ?? null;
    if (body.rules !== undefined) data.rules = String(body.rules).trim() || null;
    if (body.sortOrder !== undefined) data.sortOrder = Math.floor(Number(body.sortOrder) || 0);
    if (body.published !== undefined) data.published = Boolean(body.published);

    const activity = await prisma.activity.update({
      where: { id },
      data,
      include: { _count: { select: { enrollments: true } } },
    });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, activity: toActivityDto(activity) });
  } catch (error) {
    return fail(error, "Unable to update activity");
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid activity id" }, { status: 400 });
    const prisma = getPrisma();
    const existing = await prisma.activity.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ ok: false, error: "Activity not found" }, { status: 404 });
    await prisma.activity.delete({ where: { id } });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return fail(error, "Unable to delete activity");
  }
}
