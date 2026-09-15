import type { Metadata } from "next";
import { Open_Sans } from "next/font/google";
import "../styles/tokens.css";
import { CrmProvider } from "../components/crm/CrmContext";
import { LanguageProvider } from "../components/crm/LanguageContext";

const openSans = Open_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-open-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BeSight — Member CRM",
  description: "Internal CRM for managing BeSight members, trade accounts, and indicator access.",
  icons: { icon: "/img/favicon_besight_2025.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={openSans.variable}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- App Router root layout is the correct place for this, the rule predates app dir */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
        />
      </head>
      <body suppressHydrationWarning>
        <LanguageProvider>
          <CrmProvider>{children}</CrmProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
