import "dotenv/config";
import { snapshotMemberLots } from "./lib/server/memberLotsSync";
async function main() {
  const started = Date.now();
  const result = await snapshotMemberLots();
  console.log("snapshot done in", Math.round((Date.now() - started) / 1000), "s:", JSON.stringify(result));
}
main().catch((e) => { console.error(e); process.exit(1); });
