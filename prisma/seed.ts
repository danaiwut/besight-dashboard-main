import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { Plan, PrismaClient, RecordStatus } from "../generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not configured");
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl) });

async function main() {
  const one = await prisma.indicator.upsert({
    where: { name: "BeSight ONE" },
    update: { status: RecordStatus.active },
    create: { name: "BeSight ONE", publicationId: "BESIGHT-ONE", status: RecordStatus.active },
  });
  const orca = await prisma.indicator.upsert({
    where: { name: "BeSight Orca" },
    update: { status: RecordStatus.active },
    create: { name: "BeSight Orca", publicationId: "BESIGHT-ORCA", status: RecordStatus.active },
  });
  const freeIndicator = await prisma.indicator.upsert({
    where: { name: "BeSight Starter" },
    update: { status: RecordStatus.active },
    create: { name: "BeSight Starter", publicationId: "BESIGHT-STARTER", status: RecordStatus.active },
  });

  for (const [plan, indicatorId] of [
    [Plan.ib_partner, one.id],
    [Plan.ib_partner, orca.id],
    [Plan.free, freeIndicator.id],
  ] as const) {
    await prisma.planIndicatorEntitlement.upsert({
      where: { plan_indicatorId: { plan, indicatorId } },
      update: {},
      create: { plan, indicatorId },
    });
  }
  await prisma.systemSetting.upsert({
    where: { key: "indicator_automation" },
    update: {},
    create: {
      key: "indicator_automation",
      valueJson: JSON.stringify({ requiredLots: 3, renewalMonths: 1, enabled: true }),
      description: "Defaults for automatic Indicator access after lot qualification.",
    },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
