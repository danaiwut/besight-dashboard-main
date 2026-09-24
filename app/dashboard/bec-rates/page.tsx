"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** BEC rates now live in a dialog on the Benefits page — keep old links
 *  (notifications, bookmarks) working by opening it there. */
export default function DashboardBecRatesRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard/rewards/?bec=1");
  }, [router]);
  return null;
}
