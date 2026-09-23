import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/* On Vercel every warm function instance keeps its own pool, so the driver's
   default (10 connections each) quickly exhausts MySQL's max_connections.
   Cap it per instance unless the URL already sets connectionLimit. */
function withPoolLimit(url: string) {
  const limit = process.env.DATABASE_POOL_LIMIT || (process.env.VERCEL ? "3" : "");
  if (!limit) return url;
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("connectionLimit")) parsed.searchParams.set("connectionLimit", limit);
    return parsed.toString();
  } catch {
    return url;
  }
}

function createPrismaClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  return new PrismaClient({ adapter: new PrismaMariaDb(withPoolLimit(url)) });
}

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function getPrisma() {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = createPrismaClient();
  return globalForPrisma.prisma;
}
