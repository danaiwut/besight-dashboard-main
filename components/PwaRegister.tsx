"use client";

import { useEffect } from "react";

/** Registers the service worker in production. When an update is found it
 *  activates immediately and the page reloads once to pick it up. */
export default function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    let reloaded = false;
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        registration.addEventListener("updatefound", () => {
          registration.installing?.postMessage({ type: "SKIP_WAITING" });
        });
      })
      .catch(() => undefined);
    const onControllerChange = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);
  return null;
}
