/**
 * DEMO ONLY — creates a handful of OPEN attendance sessions for "today" so the
 * admin dashboard's "On site right now" cards look alive in screenshots.
 * Writes the created ids to prisma/demo-open-sessions-ids.json for cleanup.
 *
 *   DATABASE_URL=... npx ts-node prisma/demo-open-sessions.ts          # create
 *   DATABASE_URL=... npx ts-node prisma/demo-open-sessions.ts --undo   # remove
 */
import { PrismaClient } from '@prisma/client';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const IDS_FILE = join(__dirname, 'demo-open-sessions-ids.json');

async function main() {
  const prisma = new PrismaClient();
  const undo = process.argv.includes('--undo');

  if (undo) {
    if (!existsSync(IDS_FILE)) {
      console.log('No ids file — nothing to undo.');
      return prisma.$disconnect();
    }
    const ids: string[] = JSON.parse(readFileSync(IDS_FILE, 'utf8'));
    const res = await prisma.attendanceSession.deleteMany({ where: { id: { in: ids } } });
    console.log(`Removed ${res.count} demo session(s).`);
    return prisma.$disconnect();
  }

  const org = await prisma.organization.findFirst();
  if (!org) throw new Error('no organization');

  // Active people with a current site assignment, mixed across categories.
  const candidates = await prisma.worker.findMany({
    where: {
      organizationId: org.id,
      deletedAt: null,
      status: 'ACTIVE',
      category: { in: ['WORKER', 'STAFF'] },
      assignments: { some: { endDate: null } },
    },
    select: {
      id: true,
      category: true,
      assignments: { where: { endDate: null }, select: { siteId: true }, take: 1 },
    },
    take: 60,
  });

  // Take ~10 workers + ~3 staff for a believable on-site mix.
  const workers = candidates.filter((c) => c.category === 'WORKER').slice(0, 10);
  const staff = candidates.filter((c) => c.category === 'STAFF').slice(0, 3);
  const pick = [...workers, ...staff].filter((c) => c.assignments[0]?.siteId);

  const now = Date.now();
  const today = new Date();
  const workDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  const createdIds: string[] = [];
  for (let i = 0; i < pick.length; i++) {
    const c = pick[i];
    // Logged in 1.5–4h ago so they stay OPEN (well under the 12h auto-close).
    const loginAt = new Date(now - (90 + i * 12) * 60_000);
    const s = await prisma.attendanceSession.create({
      data: {
        organizationId: org.id,
        workerId: c.id,
        siteId: c.assignments[0].siteId,
        workDate,
        loginAt,
        state: 'OPEN',
      },
      select: { id: true },
    });
    createdIds.push(s.id);
  }

  writeFileSync(IDS_FILE, JSON.stringify(createdIds, null, 2));
  console.log(`Created ${createdIds.length} OPEN demo session(s). Ids saved to ${IDS_FILE}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
