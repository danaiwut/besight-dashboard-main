/** Minimal CSV parser for broker lot-import files: header row + comma-separated
 *  rows, quoted fields supported. No external dependency needed for the
 *  "Trade ID, Lots, Rebate, Period" shape described in the import spec. */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  function splitLine(line: string): string[] {
    const cells: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        cells.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    cells.push(cur.trim());
    return cells;
  }

  const headers = splitLine(lines[0]).map((h) => h.toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = splitLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

export type MemberImportRow = {
  broker: string;
  memberCode: string;
  name: string;
  email: string;
  phone: string;
  tradeId: string;
  lots: number;
  rebate: number;
};

/** Reads a broker "rebate history" partner export — one row per (member,
 *  trade account), with the member's identity columns repeated on every row
 *  for that member's accounts. Accepts either the Thai or English header
 *  names a partner portal export might use. Rows missing a trade ID, email,
 *  or valid lot count are skipped rather than throwing, since broker
 *  exports are messy in practice. */
export function toMemberImportRows(records: Record<string, string>[]): MemberImportRow[] {
  const key = (r: Record<string, string>, ...names: string[]) => {
    for (const name of names) {
      if (r[name]) return r[name];
    }
    return "";
  };
  return records
    .map((r) => ({
      broker: key(r, "broker").trim(),
      memberCode: key(r, "รหัสสมาชิก", "member code", "member id").trim(),
      name: key(r, "ชื่อ", "name").trim(),
      email: key(r, "อีเมล์", "อีเมล", "email").trim().toLowerCase(),
      phone: key(r, "เบอร์ติดต่อ", "phone").trim(),
      tradeId: key(r, "trade id").trim(),
      lots: parseFloat(key(r, "lots")),
      rebate: parseFloat(key(r, "rebate")) || 0,
    }))
    .filter((r) => r.tradeId && r.email && Number.isFinite(r.lots));
}

/** Groups broker-export rows by member (email is the stable identity across
 *  periods; the partner code is kept alongside for reference) so a member
 *  with several trade accounts becomes one group, matching the app's real
 *  Member 1:N TradeAccount relation instead of one row per account. */
export function groupMemberImportRows(rows: MemberImportRow[]): {
  email: string;
  memberCode: string;
  name: string;
  phone: string;
  broker: string;
  accounts: { tradeId: string; lots: number; rebate: number }[];
}[] {
  const groups = new Map<string, ReturnType<typeof groupMemberImportRows>[number]>();
  for (const r of rows) {
    let g = groups.get(r.email);
    if (!g) {
      g = { email: r.email, memberCode: r.memberCode, name: r.name, phone: r.phone, broker: r.broker, accounts: [] };
      groups.set(r.email, g);
    }
    const existing = g.accounts.find((a) => a.tradeId === r.tradeId);
    if (existing) {
      existing.lots = r.lots;
      existing.rebate = r.rebate;
    } else {
      g.accounts.push({ tradeId: r.tradeId, lots: r.lots, rebate: r.rebate });
    }
  }
  return Array.from(groups.values());
}

export type LotImportRow = { tradeId: string; lots: number; rebate: number; period: string };

/** Reads `trade id` / `lots` / `rebate` / `period` columns (case-insensitive,
 *  spaces or underscores) — rows missing a trade ID or a valid lot count are
 *  skipped rather than throwing, since broker exports are messy in practice. */
export function toLotImportRows(records: Record<string, string>[]): LotImportRow[] {
  const key = (r: Record<string, string>, name: string) => r[name] ?? r[name.replace(/ /g, "_")] ?? "";
  return records
    .map((r) => ({
      tradeId: key(r, "trade id").trim(),
      lots: parseFloat(key(r, "lots")),
      rebate: parseFloat(key(r, "rebate")) || 0,
      period: key(r, "period").trim(),
    }))
    .filter((r) => r.tradeId && Number.isFinite(r.lots));
}
