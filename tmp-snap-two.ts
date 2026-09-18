import "dotenv/config";
import { snapshotOneMemberLots } from "./lib/server/memberLotsSync";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "./generated/prisma/client";
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
async function main() {
  const members = await prisma.member.findMany({ where: { email: { in: ["danaiwut077@gmail.com", "fonartist4987@gmail.com"] } }, select: { id: true, email: true } });
  for (const m of members) {
    const lots = await snapshotOneMemberLots(m.id);
    const fresh = await prisma.member.findUnique({ where: { id: m.id }, select: { currentPeriodLots: true, currentPeriodLotsFrom: true, currentPeriodLotsTo: true } });
    console.log(m.email, "-> lots", lots, "| window", fresh?.currentPeriodLotsFrom?.toISOString().slice(0, 10), "–", fresh?.currentPeriodLotsTo?.toISOString().slice(0, 10));
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
