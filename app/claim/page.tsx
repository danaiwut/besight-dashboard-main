"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

/* Two states behind one URL: no token = ask for the email, token = set the
   password. Members exist already (the CRM sync creates them); this only
   attaches a password to the row that owns the address. */

const CARD: React.CSSProperties = {
  width: "100%", maxWidth: 400, background: "#151922", border: "1px solid #232938",
  borderRadius: 16, padding: 28,
};
const INPUT: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 10,
  border: "1px solid #2b3244", background: "#0f131b", color: "#e8eaef", fontSize: 14, marginBottom: 14,
};
const NOTE: React.CSSProperties = { margin: "0 0 20px", fontSize: 13.5, color: "#98a1b3", lineHeight: 1.5 };

function button(disabled: boolean): React.CSSProperties {
  return {
    width: "100%", padding: "11px 12px", borderRadius: 10, border: "none",
    background: disabled ? "#2a3550" : "#3b62f6", color: "#fff", fontSize: 14,
    fontWeight: 600, cursor: disabled ? "default" : "pointer",
  };
}

function RequestLink() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setDone("");
    try {
      const response = await fetch("/api/auth/claim/", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "ส่งลิงก์ไม่สำเร็จ");
      setDone(payload.message || "ส่งลิงก์แล้ว");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "ส่งลิงก์ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={CARD}>
      <h1 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 700 }}>ตั้งรหัสผ่าน</h1>
      <p style={NOTE}>กรอกอีเมลที่ลงทะเบียนไว้กับ BeSight เราจะส่งลิงก์สำหรับตั้งรหัสผ่านไปให้</p>

      {done ? (
        <p style={{ margin: "0 0 14px", fontSize: 13.5, color: "#7fd6a2", lineHeight: 1.5 }}>{done}</p>
      ) : (
        <>
          <label htmlFor="claim-email" style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6, color: "#b6bece" }}>อีเมล</label>
          <input id="claim-email" type="email" required value={email} autoFocus autoComplete="email"
            onChange={(e) => setEmail(e.target.value)} style={INPUT} />
          {error && <p style={{ margin: "0 0 14px", fontSize: 13, color: "#f4776b" }}>{error}</p>}
          <button type="submit" disabled={busy || !email} style={button(busy || !email)}>
            {busy ? "กำลังส่ง..." : "ส่งลิงก์ตั้งรหัสผ่าน"}
          </button>
        </>
      )}

      <p style={{ marginTop: 18, marginBottom: 0, fontSize: 13 }}>
        <Link href="/login" style={{ color: "#7f9cff" }}>กลับไปหน้าเข้าสู่ระบบ</Link>
      </p>
    </form>
  );
}

function SetPassword({ token }: { token: string }) {
  const [valid, setValid] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/auth/claim/complete/?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as { valid?: boolean };
        if (!cancelled) setValid(Boolean(payload.valid));
      })
      .catch(() => { if (!cancelled) setValid(false); });
    return () => { cancelled = true; };
  }, [token]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirm) { setError("รหัสผ่านทั้งสองช่องไม่ตรงกัน"); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/claim/complete/", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "ตั้งรหัสผ่านไม่สำเร็จ");
      setDone(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "ตั้งรหัสผ่านไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  if (valid === null) return <div style={CARD}>กำลังตรวจสอบลิงก์...</div>;

  if (!valid) {
    return (
      <div style={CARD}>
        <h1 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 700 }}>ลิงก์ใช้ไม่ได้</h1>
        <p style={NOTE}>ลิงก์นี้หมดอายุหรือถูกใช้ไปแล้ว ขอลิงก์ใหม่ได้ที่หน้าตั้งรหัสผ่าน</p>
        <Link href="/claim" style={{ ...button(false), display: "block", textAlign: "center", textDecoration: "none", lineHeight: "22px" }}>
          ขอลิงก์ใหม่
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div style={CARD}>
        <h1 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 700 }}>ตั้งรหัสผ่านเรียบร้อย</h1>
        <p style={NOTE}>เข้าสู่ระบบด้วยอีเมลและรหัสผ่านใหม่ได้เลย</p>
        <Link href="/login" style={{ ...button(false), display: "block", textAlign: "center", textDecoration: "none", lineHeight: "22px" }}>
          ไปหน้าเข้าสู่ระบบ
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={CARD}>
      <h1 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 700 }}>ตั้งรหัสผ่านใหม่</h1>
      <p style={NOTE}>ใช้อย่างน้อย 8 ตัวอักษร</p>

      <label htmlFor="pw" style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6, color: "#b6bece" }}>รหัสผ่านใหม่</label>
      <input id="pw" type="password" required minLength={8} value={password} autoFocus autoComplete="new-password"
        onChange={(e) => setPassword(e.target.value)} style={INPUT} />

      <label htmlFor="pw2" style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6, color: "#b6bece" }}>ยืนยันรหัสผ่าน</label>
      <input id="pw2" type="password" required minLength={8} value={confirm} autoComplete="new-password"
        onChange={(e) => setConfirm(e.target.value)} style={INPUT} />

      {error && <p style={{ margin: "0 0 14px", fontSize: 13, color: "#f4776b" }}>{error}</p>}
      <button type="submit" disabled={busy || !password || !confirm} style={button(busy || !password || !confirm)}>
        {busy ? "กำลังบันทึก..." : "บันทึกรหัสผ่าน"}
      </button>
    </form>
  );
}

function ClaimContent() {
  const token = useSearchParams().get("token");
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, background: "#0b0d12", color: "#e8eaef", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      {token ? <SetPassword token={token} /> : <RequestLink />}
    </main>
  );
}

export default function ClaimPage() {
  return (
    <Suspense fallback={null}>
      <ClaimContent />
    </Suspense>
  );
}
