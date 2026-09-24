import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { memberGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Image bytes of an admin-uploaded catalog avatar (built-ins are static
 *  files and redirect there). Linked with ?v=<version>, so cached hard. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await memberGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return new NextResponse(null, { status: 404 });
  const row = await getPrisma().leaderboardAvatarOption.findUnique({ where: { id }, select: { imageUrl: true, imageData: true } });
  if (!row) return new NextResponse(null, { status: 404 });
  if (row.imageUrl) return NextResponse.redirect(new URL(row.imageUrl, request.url));
  const match = row.imageData ? /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(row.imageData) : null;
  if (!match) return new NextResponse(null, { status: 404 });
  return new NextResponse(Buffer.from(match[2], "base64"), {
    headers: { "Content-Type": match[1], "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
