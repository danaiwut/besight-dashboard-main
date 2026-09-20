import { getPrisma } from "./prisma";
import { readGeneralSettings } from "./generalSettings";

/* ── Customer notification bell (real data) ──
    Items are derived on read from the member's own rows (rebate, renewals,
    tiers, competitions, claims, spins) — only dismissed keys persist in
    MemberNotificationRead, so new events always surface as unread. */

export type NotificationIcon = "rebate" | "renewal" | "reward" | "competition" | "claim" | "spin";

export type NotificationItem = {
  key: string;
  icon: NotificationIcon;
  titleKey: string;
  vars?: Record<string, string | number>;
  href: string;
  time: string;
  read: boolean;
};

function isoWeekKey(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function buildNotifications(memberId: number): Promise<{ items: NotificationItem[]; unread: number }> {
  const prisma = getPrisma();
  const now = new Date();
  const [settings, readRows] = await Promise.all([
    readGeneralSettings(),
    prisma.memberNotificationRead.findMany({ where: { memberId }, select: { key: true } }),
  ]);
  const read = new Set(readRows.map((row) => row.key));
  const items: NotificationItem[] = [];

  // 1. Rebate earned in the last 7 days.
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const rebate = await prisma.tradeLog.aggregate({
    where: { memberId, tradeDate: { gte: weekAgo } },
    _sum: { rebate: true },
  });
  const rebateTotal = rebate._sum.rebate?.toNumber() ?? 0;
  if (rebateTotal > 0) {
    items.push({
      key: `rebate:${isoWeekKey(now)}`,
      icon: "rebate",
      titleKey: "notif.rebate",
      vars: { amount: rebateTotal.toFixed(2) },
      href: "/dashboard/",
      time: now.toISOString(),
      read: false,
    });
  }

  // 2. Indicator access expiring soon.
  const soonLimit = new Date(now.getTime() + settings.expiringSoonDays * 86400000);
  const expiring = await prisma.memberIndicatorAccess.findMany({
    where: { memberId, status: "active", expiresAt: { lte: soonLimit } },
    include: { indicator: { select: { name: true } } },
    orderBy: { expiresAt: "asc" },
    take: 5,
  });
  for (const access of expiring) {
    const days = Math.max(0, Math.ceil((access.expiresAt.getTime() - now.getTime()) / 86400000));
    items.push({
      key: `renewal:${access.id}`,
      icon: "renewal",
      titleKey: "notif.renewal",
      vars: { indicator: access.indicator.name, days, date: access.expiresAt.toISOString().slice(0, 10) },
      href: "/dashboard/indicators/",
      time: now.toISOString(),
      read: false,
    });
  }

  // 3. Highest loyalty tier reached (lifetime lots vs the admin ladder).
  const [tiers, lifetime] = await Promise.all([
    prisma.rewardTier.findMany({ where: { active: true }, orderBy: { threshold: "asc" } }),
    prisma.tradeLog.aggregate({ where: { memberId }, _sum: { lots: true } }),
  ]);
  const lifetimeLots = lifetime._sum.lots?.toNumber() ?? 0;
  const reached = tiers.filter((tier) => lifetimeLots >= tier.threshold.toNumber()).pop();
  if (reached) {
    items.push({
      key: `tier:${reached.key}`,
      icon: "reward",
      titleKey: "notif.tier",
      vars: { tier: reached.title },
      href: "/dashboard/rewards/",
      time: now.toISOString(),
      read: false,
    });
  }

  // 4. Live competitions (with my rank when enrolled).
  const activities = await prisma.activity.findMany({
    where: {
      published: true,
      status: "live",
      OR: [{ visibleFrom: null }, { visibleFrom: { lte: now } }],
    },
    orderBy: { startDate: "desc" },
    take: 5,
    select: { id: true, slug: true, title: true },
  });
  for (const activity of activities) {
    const enrollment = await prisma.activityEnrollment.findUnique({
      where: { activityId_memberId: { activityId: activity.id, memberId } },
      select: { lots: true },
    });
    if (enrollment) {
      const ahead = await prisma.activityEnrollment.count({
        where: { activityId: activity.id, lots: { gt: enrollment.lots } },
      });
      items.push({
        key: `comp:${activity.slug}`,
        icon: "competition",
        titleKey: "notif.compStanding",
        vars: { title: activity.title, rank: ahead + 1, lots: enrollment.lots.toNumber().toFixed(2) },
        href: `/dashboard/activities/${activity.slug}/`,
        time: now.toISOString(),
        read: false,
      });
    } else {
      items.push({
        key: `comp:${activity.slug}`,
        icon: "competition",
        titleKey: "notif.compLive",
        vars: { title: activity.title },
        href: `/dashboard/activities/${activity.slug}/`,
        time: now.toISOString(),
        read: false,
      });
    }
  }

  // 5. Recently decided reward claims.
  const monthAgo = new Date(now.getTime() - 30 * 86400000);
  const claims = await prisma.rewardClaim.findMany({
    where: { memberId, status: { in: ["fulfilled", "cancelled"] }, decidedAt: { gte: monthAgo } },
    orderBy: { decidedAt: "desc" },
    take: 10,
  });
  for (const claim of claims) {
    items.push({
      key: `claim:${claim.id}`,
      icon: "claim",
      titleKey: claim.status === "fulfilled" ? "notif.claimFulfilled" : "notif.claimCancelled",
      vars: { title: claim.title },
      href: "/dashboard/my-rewards/",
      time: (claim.decidedAt ?? claim.createdAt).toISOString(),
      read: false,
    });
  }

  // 6. Recent spin results worth a look.
  const spins = await prisma.spinResult.findMany({
    where: { memberId, spunAt: { gte: monthAgo } },
    orderBy: { spunAt: "desc" },
    take: 10,
    include: { prize: { select: { name: true } } },
  });
  for (const spin of spins) {
    items.push({
      key: `spin:${spin.id}`,
      icon: "spin",
      titleKey: spin.status === "pending" ? "notif.spinPending" : spin.status === "fulfilled" ? "notif.spinFulfilled" : "notif.spinCancelled",
      vars: { prize: spin.prize.name },
      href: "/dashboard/spin-wheel/",
      time: spin.spunAt.toISOString(),
      read: false,
    });
  }

  const ranked = items
    .map((item) => ({ ...item, read: read.has(item.key) }))
    .sort((a, b) => b.time.localeCompare(a.time))
    .slice(0, 30);
  return { items: ranked, unread: ranked.filter((item) => !item.read).length };
}

export async function markNotificationsRead(memberId: number, keys: string[]): Promise<void> {
  const clean = [...new Set(keys.map((key) => String(key).trim()).filter(Boolean))].slice(0, 100);
  if (!clean.length) return;
  await getPrisma().memberNotificationRead.createMany({
    data: clean.map((key) => ({ memberId, key })),
    skipDuplicates: true,
  });
}
