/* Transactional email via the Resend REST API.
 *
 * Deliberately a plain `fetch` rather than an SDK: the app sends a handful of
 * templated messages, and the project already reaches every other external
 * service (lot-check, CRM sync) the same way.
 *
 * Fails closed and loudly. A claim link that silently goes nowhere looks
 * identical to a working one from the caller's side, so a missing key is an
 * error, never a no-op. */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(input: { to: string; subject: string; html: string; text: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    throw new Error("Email is not configured on the server (RESEND_API_KEY / EMAIL_FROM)");
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [input.to], subject: input.subject, html: input.html, text: input.text }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Email provider returned ${response.status}: ${detail.slice(0, 200)}`);
  }
}

/** The one message this app sends today: claim your account / set a password. */
export function claimEmail(memberName: string, link: string, expiresInHours: number) {
  const greeting = memberName.trim() ? memberName.trim() : "สวัสดีครับ";
  const text = [
    `${greeting}`,
    "",
    "ตั้งรหัสผ่านสำหรับบัญชี BeSight ของคุณได้ที่ลิงก์นี้:",
    link,
    "",
    `ลิงก์นี้ใช้ได้ครั้งเดียวและหมดอายุใน ${expiresInHours} ชั่วโมง`,
    "ถ้าคุณไม่ได้เป็นคนขอ ไม่ต้องดำเนินการใดๆ บัญชีของคุณยังปลอดภัยดี",
  ].join("\n");

  const html = `
    <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#1b1f2a">
      <p>${escapeHtml(greeting)}</p>
      <p>ตั้งรหัสผ่านสำหรับบัญชี BeSight ของคุณได้ที่ปุ่มด้านล่าง</p>
      <p style="margin:24px 0">
        <a href="${escapeHtml(link)}" style="display:inline-block;padding:11px 20px;border-radius:10px;background:#3b62f6;color:#fff;text-decoration:none;font-weight:600">ตั้งรหัสผ่าน</a>
      </p>
      <p style="font-size:13px;color:#61697d">ลิงก์นี้ใช้ได้ครั้งเดียวและหมดอายุใน ${expiresInHours} ชั่วโมง<br>ถ้าคุณไม่ได้เป็นคนขอ ไม่ต้องดำเนินการใดๆ บัญชีของคุณยังปลอดภัยดี</p>
    </div>`;

  return { subject: "ตั้งรหัสผ่านบัญชี BeSight", html, text };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
