import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "./generated/prisma/client";
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
async function main() {
  const email = "danaiwut077@gmail.com";
  const m = await prisma.member.findFirst({ where: { email }, select: { id: true, code: true, name: true, email: true, externalId: true } });
  console.log("member:", JSON.stringify(m));
  if (m) {
    const accts = await prisma.tradeAccount.findMany({ where: { memberId: m.id }, select: { id: true, tradeId: true, brokerId: true, accountType: true, partnerIb: true, verification: true, createdAt: true, lastSyncAt: true } });
    console.log("accounts:", JSON.stringify(accts, null, 1));
  }
  const a = await prisma.tradeAccount.findMany({ where: { tradeId: "30243614" }, select: { id: true, memberId: true, partnerIb: true, createdAt: true, lastSyncAt: true } });
  console.log("account 30243614:", JSON.stringify(a));
}
main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
