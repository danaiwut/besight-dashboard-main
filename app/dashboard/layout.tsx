import type { Metadata } from "next";
import "../../styles/dashboard.css";
import DashboardChrome from "../../components/dashboard/DashboardChrome";
import { ThemeProvider } from "../../components/dashboard/ThemeContext";

export const metadata: Metadata = {
  title: "Dashboard — BeSight",
  robots: { index: false },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <DashboardChrome>{children}</DashboardChrome>
    </ThemeProvider>
  );
}
