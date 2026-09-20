"use client";

import Link from "next/link";

export default function OfflinePage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "#0b0b12",
        color: "#fff",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 360 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- offline fallback, plain img avoids Image optimization */}
        <img src="/icons/icon-192.png" alt="BeSight" width={72} height={72} style={{ borderRadius: 18 }} />
        <h1 style={{ fontSize: 22, margin: "16px 0 8px" }}>You&apos;re offline</h1>
        <p style={{ fontSize: 14, opacity: 0.7, margin: "0 0 20px" }}>
          Check your connection and try again.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: "10px 22px",
              borderRadius: 10,
              border: "none",
              background: "#0030EC",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Retry
          </button>
          <Link
            href="/dashboard/"
            style={{
              padding: "10px 22px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.25)",
              color: "#fff",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
