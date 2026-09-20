import "dotenv/config";
async function main() {
  const baseUrl = process.env.CRM_CUSTOMERS_URL!;
  const token = process.env.CRM_CUSTOMERS_TOKEN!;
  let cursor: string | null = null;
  let total = 0;
  let pages = 0;
  for (let page = 0; page < 100; page++) {
    const url = new URL(baseUrl);
    url.searchParams.set("limit", "1000");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, apikey: token, Accept: "application/json" },
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`page ${pages} failed ${res.status}: ${body.slice(0, 200)}`);
    const parsed = JSON.parse(body) as { data?: unknown[]; has_more?: boolean; next_cursor?: string };
    const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed.data) ? parsed.data : [];
    total += rows.length;
    pages++;
    if (!parsed.has_more || !parsed.next_cursor) break;
    cursor = parsed.next_cursor;
  }
  console.log(JSON.stringify({ pages, total }));
}
main().catch((e) => { console.error(e); process.exit(1); });
