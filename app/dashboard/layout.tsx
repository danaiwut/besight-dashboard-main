import type { Metadata } from "next";
import { redirect } from "next/navigation";
import "../../styles/dashboard.css";
import { auth } from "@/auth";
import { CrmProvider } from "../../components/crm/CrmContext";
import DashboardChrome from "../../components/dashboard/DashboardChrome";
import { ThemeProvider } from "../../components/dashboard/ThemeContext";

export const metadata: Metadata = {
  title: "Dashboard — BeSight",
  robots: { index: false },
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "member" && session.user.role !== "admin") redirect("/login");

  return (
    <CrmProvider mode="member" viewer={{ name: session.user.name ?? "", email: session.user.email ?? "", role: "member" }}>
      <ThemeProvider>
        <DashboardChrome>{children}</DashboardChrome>
      </ThemeProvider>
    </CrmProvider>
  );
}
