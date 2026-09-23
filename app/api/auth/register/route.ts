import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/server/prisma";
import { MIN_PASSWORD_LENGTH, registerMember } from "@/lib/server/register";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({})) as { name?: string; email?: string; password?: string };
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim();
  const password = String(body.password || "");

  if (!name || !EMAIL_RE.test(email) || password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ ok: false, error: "invalid", code: "invalid" }, { status: 400 });
  }

  const result = await registerMember({ name, email, password });
  if (!result.ok) {
    if (result.error === "email_taken") {
      return NextResponse.json(
        { ok: false, error: "email_taken", code: "email_taken" },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: false, error: "invalid", code: "invalid" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
