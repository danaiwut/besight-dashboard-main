import "dotenv/config";
const hardStop = setTimeout(() => { console.error("HARD TIMEOUT at stage"); process.exit(1); }, 60000);
import { snapshotOneMemberLots } from "./lib/server/memberLotsSync";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "./generated/prisma/client";
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
async function main() {
  console.log("A: query members");
  const members = await prisma.member.findMany({ where: { email: { in: ["danaiwut077@gmail.com"] } }, select: { id: true, email: true } });
  console.log("B: got", members.length);
  for (const m of members) {
    console.log("C: snapshot", m.email);
    const lots = await snapshotOneMemberLots(m.id);
    console.log("D: lots", lots);
    const fresh = await prisma.member.findUnique({ where: { id: m.id }, select: { currentPeriodLots: true, currentPeriodLotsFrom: true, currentPeriodLotsTo: true } });
    console.log("E:", fresh?.currentPeriodLots.toString(), fresh?.currentPeriodLotsFrom?.toISOString().slice(0, 10), "–", fresh?.currentPeriodLotsTo?.toISOString().slice(0, 10));
  }
  clearTimeout(hardStop);
  await prisma.$disconnect();
}
main().catch((e) => { console.error("ERR", e); process.exit(1); });
