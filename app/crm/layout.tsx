import type { Metadata } from "next";
import "../../styles/crm.css";
import CrmChrome from "../../components/crm/CrmChrome";

export const metadata: Metadata = {
  title: "Member CRM — BeSight Admin",
  robots: { index: false },
};

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return <CrmChrome>{children}</CrmChrome>;
}
