import { getPrisma } from "./prisma";

export const DATA_VERSION_KEY = "crm_data_version";

/** Current realtime counter (0 when never bumped). Cheap single-row read —
 *  polled by the CRM provider, so keep it free of joins and writes. */
export async function readDataVersion(): Promise<number> {
  const record = await getPrisma().systemSetting.findUnique({ where: { key: DATA_VERSION_KEY } });
  const version = Number(record?.valueJson);
  return Number.isInteger(version) && version >= 0 ? version : 0;
}

/** Atomically increment the counter. Single statement so concurrent writers
 *  (UI mutations, sync, crons) can never lose a bump and hide a change from
 *  polling clients. Falls back to read-modify-write if the raw query fails. */
export async function bumpDataVersion(): Promise<number> {
  const prisma = getPrisma();
  try {
    await prisma.$executeRaw`
      INSERT INTO \`SystemSetting\` (\`key\`, \`valueJson\`, \`description\`, \`updatedAt\`)
      VALUES (${DATA_VERSION_KEY}, '1', 'Monotonic counter for CRM realtime refresh (see ADR-001).', NOW(3))
      ON DUPLICATE KEY UPDATE \`valueJson\` = CAST(CAST(\`valueJson\` AS UNSIGNED) + 1 AS CHAR), \`updatedAt\` = NOW(3)`;
  } catch {
    const current = await readDataVersion();
    await prisma.systemSetting.upsert({
      where: { key: DATA_VERSION_KEY },
      update: { valueJson: String(current + 1) },
      create: {
        key: DATA_VERSION_KEY,
        valueJson: String(current + 1),
        description: "Monotonic counter for CRM realtime refresh (see ADR-001).",
      },
    });
  }
  return readDataVersion();
}
