import type { Metadata } from "next";
import { redirect } from "next/navigation";
import "../../styles/crm.css";
import { auth } from "@/auth";
import { CrmProvider } from "../../components/crm/CrmContext";
import CrmChrome from "../../components/crm/CrmChrome";

export const metadata: Metadata = {
  title: "Member CRM — BeSight Admin",
  robots: { index: false },
};

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Members have no business in the CRM — send them to their dashboard.
  if (session.user.role !== "admin") redirect("/dashboard");

  return (
    <CrmProvider viewer={{ name: session.user.name ?? "", email: session.user.email ?? "", role: "admin" }}>
      <CrmChrome>{children}</CrmChrome>
    </CrmProvider>
  );
}
