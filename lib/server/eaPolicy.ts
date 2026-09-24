import { getPrisma } from "./prisma";

/* EA download policy — the terms a member must accept before an indicator's
   EA download link is released. Admin-edited on /crm/indicators; stored as a
   SystemSetting so no schema change is needed. `version` bumps on every text
   change, and each acceptance is logged against the version shown, so the
   audit trail proves exactly which wording the member agreed to. */

export const EA_POLICY_KEY = "ea_download_policy";

export type EaPolicy = { text: string; version: number; updatedAt: string | null; updatedBy: string | null };

export const DEFAULT_EA_POLICY_TEXT = `ข้อตกลงและเงื่อนไขการใช้งาน EA (Expert Advisor)

1. EA นี้เป็นเครื่องมือช่วยการเทรดเท่านั้น ไม่ใช่คำแนะนำการลงทุน และไม่รับประกันผลกำไรใด ๆ
2. การเทรดผลิตภัณฑ์ทางการเงิน (Forex, CFD, ทองคำ ฯลฯ) มีความเสี่ยงสูง ท่านอาจสูญเสียเงินทุนบางส่วนหรือทั้งหมด
3. ผลการทำงานในอดีตหรือผลการทดสอบย้อนหลัง ไม่ได้รับประกันผลลัพธ์ในอนาคต
4. ท่านเป็นผู้ตัดสินใจติดตั้ง ตั้งค่า และใช้งาน EA ด้วยตนเองทั้งหมด และยอมรับความเสี่ยงที่เกิดขึ้นทั้งหมดแต่เพียงผู้เดียว
5. BeSight ผู้พัฒนา และผู้ให้บริการที่เกี่ยวข้อง ไม่ต้องรับผิดชอบต่อความเสียหาย การขาดทุน หรือค่าใช้จ่ายใด ๆ ทั้งทางตรงและทางอ้อม ที่เกิดจากการใช้งาน EA รวมถึงความผิดพลาดของระบบ การเชื่อมต่อ โบรกเกอร์ หรือสภาวะตลาด
6. ห้ามเผยแพร่ ขายต่อ ดัดแปลง หรือแจกจ่ายไฟล์ EA ให้บุคคลอื่นโดยไม่ได้รับอนุญาต
7. การกดยืนยันถือว่าท่านได้อ่าน เข้าใจ และยอมรับข้อตกลงนี้ทั้งหมด และสละสิทธิ์ในการเรียกร้องหรือดำเนินคดีใด ๆ ต่อ BeSight ที่เกี่ยวข้องกับการใช้งาน EA`;

function defaultPolicy(): EaPolicy {
  return { text: DEFAULT_EA_POLICY_TEXT, version: 1, updatedAt: null, updatedBy: null };
}

export async function readEaPolicy(): Promise<EaPolicy> {
  const record = await getPrisma().systemSetting.findUnique({ where: { key: EA_POLICY_KEY } });
  if (!record) return defaultPolicy();
  try {
    const parsed = JSON.parse(record.valueJson) as Partial<EaPolicy>;
    const text = typeof parsed.text === "string" && parsed.text.trim() ? parsed.text : DEFAULT_EA_POLICY_TEXT;
    const version = Number.isInteger(parsed.version) && Number(parsed.version) > 0 ? Number(parsed.version) : 1;
    return { text, version, updatedAt: parsed.updatedAt ?? null, updatedBy: parsed.updatedBy ?? null };
  } catch {
    return defaultPolicy();
  }
}

export async function writeEaPolicy(text: string, actor: string): Promise<EaPolicy> {
  const current = await readEaPolicy();
  const trimmed = text.trim();
  // Unchanged wording keeps its version — earlier acceptances stay valid.
  const version = trimmed === current.text.trim() ? current.version : current.version + 1;
  const policy: EaPolicy = { text: trimmed, version, updatedAt: new Date().toISOString(), updatedBy: actor };
  await getPrisma().systemSetting.upsert({
    where: { key: EA_POLICY_KEY },
    update: { valueJson: JSON.stringify(policy) },
    create: { key: EA_POLICY_KEY, valueJson: JSON.stringify(policy), description: "EA download policy members must accept before downloading." },
  });
  return policy;
}

/** Accepts only an absolute http(s) link (Google Drive share links etc.);
 *  "" clears it. Returns an error message for anything else. */
export function normalizeEaUrl(value: unknown): { ok: true; url: string | null } | { ok: false; error: string } {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: true, url: null };
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("bad protocol");
    return { ok: true, url: url.toString() };
  } catch {
    return { ok: false, error: "EA download link must be a full https:// URL (e.g. a Google Drive share link)" };
  }
}
