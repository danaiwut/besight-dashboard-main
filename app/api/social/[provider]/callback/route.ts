import { NextRequest, NextResponse } from "next/server";
import { linkCallback } from "../flow";
import type { SocialProvider } from "@/lib/server/social";

export const dynamic = "force-dynamic";

/** OAuth callback: /api/social/discord/callback/ and /api/social/line/callback/ */
export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const raw = (await params).provider;
  const provider: SocialProvider | null = raw === "discord" || raw === "line" ? raw : null;
  if (!provider) return NextResponse.json({ ok: false, error: "Unknown provider" }, { status: 400 });
  return linkCallback(request, provider);
}
