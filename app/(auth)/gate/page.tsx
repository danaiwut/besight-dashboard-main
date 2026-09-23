import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import GateForm from "./GateForm";

export const metadata: Metadata = {
  title: "Sign In Again — BeSight",
  description: "Your session expired — sign in again to continue.",
  robots: { index: false },
};

/** Only a single leading slash survives — anything else (absolute URLs,
 *  protocol-relative "//evil") falls back to the CRM. */
function sanitizeNext(value: unknown): string {
  const s = typeof value === "string" ? value : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/crm/";
}

/* Re-login page for dead sessions. Linked from the CRM's DataUnavailable
   banner ("หมดเวลาใช้งาน") as /gate/?next=<page>: a stale JWT still renders
   the CRM shell (the layout only checks a session exists) while every API
   call 401s, so the banner points here. A still-valid session skips the form
   and goes straight to `next`. */
export default async function GatePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = sanitizeNext((await searchParams).next);
  const user = (await auth())?.user;
  if (user && isDatabaseConfigured()) {
    const prisma = getPrisma();
    let valid = false;
    if (user.role === "admin" && user.adminId) {
      const admin = await prisma.admin.findUnique({ where: { id: user.adminId }, select: { tokenVersion: true } });
      valid = !!admin && (user.tokenVersion ?? 0) === admin.tokenVersion;
    } else if (user.role === "member" && user.memberId) {
      const member = await prisma.member.findUnique({ where: { id: user.memberId }, select: { tokenVersion: true } });
      valid = !!member && (user.tokenVersion ?? 0) === member.tokenVersion;
    }
    if (valid) redirect(next);
  }
  return <GateForm next={next} />;
}
