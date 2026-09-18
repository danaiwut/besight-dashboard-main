import { NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { adminGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

function escapeHtml(value: string) {
  return value.replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character] || character);
}

function notificationHtml(action: string, memberName: string, description: string) {
  const member = memberName ? `<strong>${escapeHtml(memberName)}</strong> ` : "";
  if (action === "Indicator Renewed") return `${member}Indicator access renewed automatically.`;
  if (action === "Indicator Granted") return `${member}received Indicator access.`;
  if (action === "Indicator Expired") return `${member}Indicator access expired.`;
  if (action === "Trade ID Verified") return `${member}Trade account was verified.`;
  if (action === "Telegram Access Removed") return `${member}Telegram access was removed.`;
  if (action === "Telegram Access Granted") return `${member}Telegram access was granted.`;
  if (action === "Lots Updated") return `${member}lot data was updated.`;
  return `${member}${escapeHtml(description)}`;
}

export async function GET() {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const records = await getPrisma().activityLog.findMany({
      where: { notification: true },
      take: 30,
      orderBy: { createdAt: "desc" },
      include: { member: { select: { name: true } } },
    });
    return NextResponse.json({ ok: true, notifications: records.map((record) => ({
      id: Number(record.id),
      icon: record.action === "Indicator Renewed" || record.action === "Indicator Granted" ? "renewal" : record.action.includes("Telegram") ? "telegram" : record.action.includes("Expired") || record.action.includes("Lots") ? "warn" : "member",
      html: notificationHtml(record.action, record.member?.name || "", record.description),
      description: record.description,
      timestamp: record.createdAt.toISOString(),
      read: Boolean(record.notificationReadAt),
    })) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load notifications" }, { status: 500 });
  }
}
