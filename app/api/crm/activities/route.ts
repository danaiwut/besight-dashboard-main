import { NextRequest, NextResponse } from "next/server";
import { ActivityStatus } from "@/generated/prisma/client";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { toActivityDto } from "@/lib/server/crmDtos";
import { adminGuard, adminWriteGuard } from "@/lib/session";

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

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function uniqueSlug(prisma: ReturnType<typeof getPrisma>, desired: string, excludeId?: number) {
  const base = desired || `activity-${Date.now().toString(36)}`;
  for (let attempt = 0; attempt < 20; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const clash = await prisma.activity.findUnique({ where: { slug }, select: { id: true } });
    if (!clash || clash.id === excludeId) return slug;
  }
  throw new Error("Unable to generate a unique activity slug");
}

export async function GET() {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const records = await getPrisma().activity.findMany({
      orderBy: [{ sortOrder: "asc" }, { startDate: "desc" }],
      include: { _count: { select: { enrollments: true } } },
    });
    return NextResponse.json({ ok: true, activities: records.map((record) => toActivityDto(record)) });
  } catch (error) {
    return fail(error, "Unable to load activities", 500);
  }
}

export async function POST(request: NextRequest) {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const title = String(body.title || "").trim();
    if (!title) return NextResponse.json({ ok: false, error: "Title is required" }, { status: 400 });

    const startDate = optionalDate(body.startDate);
    const endDate = optionalDate(body.endDate);
    if (!startDate || !endDate) return NextResponse.json({ ok: false, error: "Start and end dates are required" }, { status: 400 });
    if (startDate > endDate) return NextResponse.json({ ok: false, error: "Start date must be on or before end date" }, { status: 400 });

    const status = STATUSES.includes(body.status as (typeof STATUSES)[number])
      ? body.status as ActivityStatus
      : ActivityStatus.upcoming;
    const prisma = getPrisma();
    const slug = await uniqueSlug(prisma, String(body.slug || "").trim() || slugify(title));

    const activity = await prisma.activity.create({
      data: {
        slug,
        title,
        description: String(body.description || "").trim() || null,
        status,
        startDate,
        endDate,
        traders: Math.max(0, Math.floor(Number(body.traders) || 0)),
        prizePool: Math.max(0, Number(body.prizePool) || 0),
        coverImage: String(body.coverImage || "").trim() || null,
        visibleFrom: optionalDate(body.visibleFrom) ?? null,
        registrationOpensAt: optionalDate(body.registrationOpensAt) ?? null,
        rules: String(body.rules || "").trim() || null,
        sortOrder: Math.floor(Number(body.sortOrder) || 0),
        published: body.published === undefined ? true : Boolean(body.published),
      },
      include: { _count: { select: { enrollments: true } } },
    });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, activity: toActivityDto(activity) });
  } catch (error) {
    return fail(error, "Unable to create activity");
  }
}
