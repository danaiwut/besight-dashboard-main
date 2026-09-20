import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { ActivityStatus, Plan, PrismaClient, RecordStatus } from "../generated/prisma/client";
import { hashPassword } from "../lib/server/password";
import { DEFAULT_BEC_RATES } from "../lib/becRates";
import { COURSE_SEED, seedLessonsFor } from "../lib/courses";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not configured");
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl) });

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Standard competition rules, stored as admin-entered plain text (the rules
 *  column is single-language by design; the customer page renders one per line). */
const COMPETITION_RULES = [
  "Open to all verified BeSight members with an active linked trading account.",
  "Rankings are calculated from total lots traded on your linked account during the competition period.",
  "A minimum of 5 lots is required during the period to qualify for a prize.",
  "One trading account per member — duplicate or shared accounts will be disqualified.",
  "Prizes are credited as bonus rebate to your wallet within 7 business days after the competition ends.",
  "BeSight reserves the right to disqualify accounts showing abusive trading patterns (e.g. arbitrage or latency exploitation).",
].join("\n");

async function main() {
  /* Owner admin for email/password sign-in. Override with ADMIN_EMAIL /
     ADMIN_PASSWORD; the password is only hashed when the row has none yet, so
     re-running the seed never resets a changed password. */
  const adminEmail = process.env.ADMIN_EMAIL || "admin@besight.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "besight-admin";
  const existingAdmin = await prisma.admin.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    await prisma.admin.create({
      data: { name: "BeSight Owner", email: adminEmail, role: "Owner", isOwner: true, passwordHash: await hashPassword(adminPassword) },
    });
    console.log(`👤  Seeded owner admin ${adminEmail} (set ADMIN_PASSWORD to change the password)`);
  } else if (!existingAdmin.passwordHash) {
    await prisma.admin.update({ where: { id: existingAdmin.id }, data: { passwordHash: await hashPassword(adminPassword) } });
    console.log(`👤  Set a password for existing admin ${adminEmail}`);
  }

  await prisma.broker.upsert({
    where: { code: "EXNESS" },
    update: { name: "Exness", url: "https://www.exness.com/", status: RecordStatus.active, importMethod: "API" },
    create: { code: "EXNESS", name: "Exness", url: "https://www.exness.com/", status: RecordStatus.active, importMethod: "API" },
  });
  await prisma.broker.upsert({
    where: { code: "XM" },
    update: { name: "XM", url: "https://www.xm.com/", status: RecordStatus.active, importMethod: "API" },
    create: { code: "XM", name: "XM", url: "https://www.xm.com/", status: RecordStatus.active, importMethod: "API" },
  });

  const one = await prisma.indicator.upsert({
    where: { name: "BeSight One STR" },
    update: { publicationId: "75ee20d5bee6431c9bdef0282d58fdd3", status: RecordStatus.active },
    create: { name: "BeSight One STR", publicationId: "75ee20d5bee6431c9bdef0282d58fdd3", status: RecordStatus.active },
  });
  const orca = await prisma.indicator.upsert({
    where: { name: "Besight Orca" },
    update: { publicationId: "341c1526463b46f198b3f2ee63d9bf4a", status: RecordStatus.active },
    create: { name: "Besight Orca", publicationId: "341c1526463b46f198b3f2ee63d9bf4a", status: RecordStatus.active },
  });

  for (const [plan, indicatorId] of [
    [Plan.ib_partner, one.id],
    [Plan.ib_partner, orca.id],
    [Plan.free, orca.id],
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

  /* ── BEC points & Spin & Win ── */
  await prisma.systemSetting.upsert({
    where: { key: "spin" },
    update: {},
    create: {
      key: "spin",
      valueJson: JSON.stringify({ enabled: true, costPerSpin: 100, defaultPointsPerLot: 0.1, minWithdraw: 15 }),
      description: "BEC points & Spin & Win settings.",
    },
  });
  // The loyalty sheet's points table — admins can override any row in the CRM.
  for (const [symbol, pointsPerLot] of DEFAULT_BEC_RATES) {
    await prisma.becRate.upsert({
      where: { symbol },
      update: {},
      create: { symbol, pointsPerLot, active: true },
    });
  }
  // Wheel prizes from the rewards sheet. Weight = relative chance.
  const prizes = [
    { name: 'Apple iPad 11" หรือเงินสด $300', icon: "emoji_events", valueNote: "$300.00", weight: 1, sortOrder: 0 },
    { name: "เงินสด $200", icon: "payments", valueNote: "$200.00", weight: 2, sortOrder: 1 },
    { name: "เงินสด $120", icon: "payments", valueNote: "$120.00", weight: 4, sortOrder: 2 },
    { name: "เงินสด $40", icon: "payments", valueNote: "$40.00", weight: 10, sortOrder: 3 },
    { name: "เงินสด $15", icon: "card_giftcard", valueNote: "$15.00", weight: 20, sortOrder: 4 },
  ];
  for (const prize of prizes) {
    const existing = await prisma.spinPrize.findFirst({ where: { name: prize.name }, select: { id: true } });
    if (!existing) await prisma.spinPrize.create({ data: { ...prize, active: true } });
  }

  /* ── Course Online (LMS): one course per curriculum in lib/courses.ts ── */
  for (const [index, seed] of COURSE_SEED.entries()) {
    const course = await prisma.course.upsert({
      where: { slug: seed.slug },
      update: {},
      create: {
        slug: seed.slug,
        title: seed.title,
        description: seed.description,
        category: seed.category,
        level: seed.level,
        instructor: seed.instructor,
        sortOrder: index,
        published: true,
      },
    });
    const lessons = await prisma.courseLesson.count({ where: { courseId: course.id } });
    const seeds = seedLessonsFor(seed, index);
    if (!lessons) {
      for (const lesson of seeds) {
        await prisma.courseLesson.create({ data: { courseId: course.id, ...lesson } });
      }
    } else {
      // Backfill section titles for lessons created before sections existed.
      const existing = await prisma.courseLesson.findMany({ where: { courseId: course.id }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
      for (const [i, lesson] of existing.entries()) {
        if (!lesson.sectionTitle && seeds[i]) {
          await prisma.courseLesson.update({ where: { id: lesson.id }, data: { sectionTitle: seeds[i].sectionTitle } });
        }
      }
    }
  }

  /* One real activity so the customer /dashboard/activities page has content
     out of the box. Dates track the current calendar month (stable slug), so a
     freshly seeded database always shows the month in progress. These are the
     live competition's real terms — the only placeholder is `traders`, which
     stays 0 until participant tracking exists. */
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const monthStart = new Date(Date.UTC(year, month, 1));
  const monthEnd = new Date(Date.UTC(year, month + 1, 0));
  const activitySlug = `${year}-${String(month + 1).padStart(2, "0")}`;
  const activityTitle = `${MONTH_NAMES[month]} Competition ${year}`;

  await prisma.activity.upsert({
    where: { slug: activitySlug },
    update: {
      title: activityTitle,
      status: ActivityStatus.live,
      startDate: monthStart,
      endDate: monthEnd,
      prizePool: 2000,
      rules: COMPETITION_RULES,
      published: true,
    },
    create: {
      slug: activitySlug,
      title: activityTitle,
      description: "Trade your linked BeSight account during the competition window — the Top 20 traders by total lots share a $2,000 cash prize pool plus bonus rebate credit.",
      status: ActivityStatus.live,
      startDate: monthStart,
      endDate: monthEnd,
      traders: 0,
      prizePool: 2000,
      rules: COMPETITION_RULES,
      sortOrder: 0,
      published: true,
    },
  });

  /* ── Loyalty tier ladder (admin-editable in /crm/reward-tiers; update: {}
     keeps admin edits on re-seed) ── */
  const tiers = [
    { key: "bronze", title: "บรอนซ์", titleEn: "Bronze", threshold: 1, reward: "เพิ่มเรทเงินคืน 5%", rewardEn: "5% rebate boost", icon: "military_tech", image: "/img/Loyalty/rebate-boost.jpg", accent: "#A3673F", sortOrder: 0 },
    { key: "silver", title: "ซิลเวอร์", titleEn: "Silver", threshold: 50, reward: "โบนัสเงินสด $50", rewardEn: "$50 cash bonus", icon: "military_tech", image: "/img/Loyalty/cash-bonus.jpg", accent: "#9AA3B0", sortOrder: 1 },
    { key: "gold", title: "โกลด์", titleEn: "Gold", threshold: 150, reward: "แจก BeSight Orca ฟรี", rewardEn: "Free BeSight Orca indicator", icon: "military_tech", image: "/img/Loyalty/orca-indicator.jpg", accent: "#D4AF37", sortOrder: 2 },
    { key: "beyond", title: "Beyond", titleEn: "Beyond", threshold: 500, reward: "มือถือเรือธงรุ่นล่าสุด", rewardEn: "Latest flagship phone", icon: "rocket_launch", image: "/img/Loyalty/flagship-phone.jpg", accent: "#2F6FED", sortOrder: 3 },
    { key: "exclusive", title: "Exclusive", titleEn: "Exclusive", threshold: 2000, reward: "รถยนต์ไฟฟ้า Geely EX2", rewardEn: "Geely EX2 Electric SUV", icon: "diamond", image: "/img/Loyalty/geely20ex2-1775018889656.webp", accent: "#8B3FE0", sortOrder: 4 },
  ];
  for (const tier of tiers) {
    await prisma.rewardTier.upsert({ where: { key: tier.key }, update: {}, create: tier });
  }

  /* Default prize table for the seeded monthly activity (only when empty). */
  const seededActivity = await prisma.activity.findUnique({ where: { slug: activitySlug }, select: { id: true } });
  if (seededActivity && (await prisma.competitionPrize.count({ where: { activityId: seededActivity.id } })) === 0) {
    await prisma.competitionPrize.createMany({
      data: [
        { activityId: seededActivity.id, rankFrom: 1, rankTo: 1, title: "รางวัลชนะเลิศอันดับ 1", valueNote: "$500.00", sortOrder: 0 },
        { activityId: seededActivity.id, rankFrom: 2, rankTo: 2, title: "รางวัลอันดับ 2", valueNote: "$350.00", sortOrder: 1 },
        { activityId: seededActivity.id, rankFrom: 3, rankTo: 3, title: "รางวัลอันดับ 3", valueNote: "$250.00", sortOrder: 2 },
        { activityId: seededActivity.id, rankFrom: 4, rankTo: 10, title: "รางวัลอันดับ 4–10", valueNote: "$100.00", sortOrder: 3 },
        { activityId: seededActivity.id, rankFrom: 11, rankTo: 20, title: "รางวัลอันดับ 11–20", valueNote: "$20.00", sortOrder: 4 },
      ],
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
