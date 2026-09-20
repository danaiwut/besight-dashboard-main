import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "./generated/prisma/client";
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
async function main() {
  const [m, a, t, b, i, ac, tg, al, ver, admins] = await Promise.all([
    prisma.member.count(),
    prisma.tradeAccount.count(),
    prisma.tradeLog.count(),
    prisma.broker.count(),
    prisma.indicator.count(),
    prisma.memberIndicatorAccess.count(),
    prisma.telegramAccess.count(),
    prisma.activityLog.count(),
    prisma.systemSetting.findFirst({ where: { key: "crm_data_version" } }),
    prisma.admin.findMany({ select: { id: true, email: true, role: true, isOwner: true } }),
  ]);
  console.log(JSON.stringify({ members: m, tradeAccounts: a, tradeLogs: t, brokers: b, indicators: i, access: ac, telegram: tg, activityLogs: al, version: (ver as unknown as { value?: string } | null)?.value ?? null, admins }, null, 2));
}
main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
