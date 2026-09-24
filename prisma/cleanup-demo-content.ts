/** One-off: removes the demo content older seeds inserted — every course
 *  (lessons, enrollments and watch progress cascade), the loyalty reward
 *  tiers, the spin-wheel prizes and the competition prize tables — so the
 *  dashboard shows only what admins create in the CRM.
 *  Run: npx tsx prisma/cleanup-demo-content.ts */
import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not configured");
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl) });

async function main() {
  const result = await prisma.$transaction(async (tx) => ({
    courses: (await tx.course.deleteMany({})).count,
    rewardTiers: (await tx.rewardTier.deleteMany({})).count,
    spinPrizes: (await tx.spinPrize.deleteMany({})).count,
    competitionPrizes: (await tx.competitionPrize.deleteMany({})).count,
  }));
  console.log(`Deleted on ${new URL(databaseUrl!).host}:`, result);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
