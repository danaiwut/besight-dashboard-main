import type { Lang } from "./i18n";

/* ── Shared date locale for month names ──
   The CRM + dashboard share one LanguageContext, so one module-level locale
   keeps every date helper consistent without threading `lang` through ~30
   call sites. LanguageProvider syncs it on mount and on every switch, always
   before the re-render that reads it.
   Years stay Gregorian in both languages (the UI never uses Buddhist Era). */

export const MONTHS_SHORT: Record<Lang, string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  th: ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."],
};

export const MONTHS_LONG: Record<Lang, string[]> = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  th: ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"],
};

let dateLang: Lang = "en";

export function setDateLang(lang: Lang) {
  dateLang = lang;
}

export function getDateLang(): Lang {
  return dateLang;
}

/** "Sep 16, 2026" / "16 ก.ย. 2026" — Thai order is day-first, per convention. */
export function formatDay(d: Date): string {
  const mon = MONTHS_SHORT[dateLang][d.getMonth()];
  return dateLang === "th" ? `${d.getDate()} ${mon} ${d.getFullYear()}` : `${mon} ${d.getDate()}, ${d.getFullYear()}`;
}
