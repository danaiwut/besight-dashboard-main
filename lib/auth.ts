"use client";

/**
 * Demo-only auth flow (no backend), ported from auth.js: writes the same
 * localStorage keys the rest of the site reads (dts_tv, dts_email,
 * dts_registered), then redirects into the CRM.
 */
export function completeAuth({
  email,
  tradingview,
}: {
  email?: string;
  tradingview?: string;
}) {
  if (tradingview) window.localStorage.setItem("dts_tv", tradingview);
  if (email) window.localStorage.setItem("dts_email", email);
  window.localStorage.setItem("dts_registered", "1");
  window.location.href = "/crm";
}
