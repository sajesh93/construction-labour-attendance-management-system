/**
 * Refreshes demo attendance so the dashboard + attendance page look alive and
 * consistent RIGHT NOW, for validation:
 *   - auto-closes any stale OPEN sessions from previous days (credits 8h),
 *   - rebuilds yesterday's sessions: mostly CLOSED, a handful AUTO_CLOSED
 *     ("missed logout") so the dashboard's yesterday cards populate,
 *   - rebuilds today's sessions: a mix of still-OPEN (on site now) and CLOSED,
 *     spread across designations and vendors.
 *
 * Safe to re-run: it deletes today's + yesterday's sessions for the org first.
 * Operates on existing people (run seed-demo.ts first if the org is empty).
 *
 * Run: DATABASE_URL=... npx ts-node prisma/seed-demo-live.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const AUTO_CREDIT_MINUTES = 8 * 60;

// Deterministic PRNG so reruns behave the same within a day.
let seed = 1337;
function rand(): number {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
const between = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

/** IST midnight (as a UTC Date) for a day offset from today. */
function workDateFor(daysAgo: number): Date {
  const istNow = new Date(Date.now() + 5.5 * 3600_000);
  return new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate() - daysAgo));
}

/** A Date at IST wall-clock hour:minute on a day offset from today. */
function istDate(daysAgo: number, hour: number, minute: number): Date {
  const d = workDateFor(daysAgo);
  return new Date(d.getTime() + (hour - 5.5) * 3600_000 + minute * 60_000);
}

async function main() {
  const org = await prisma.organization.findFirst({ where: { isActive: true } });
  if (!org) throw new Error('No organization found.');

  // Visitors are day passes that auto-expire; revive the demo ones for today so
  // the Visitors card and drill-down can be validated too.
  await prisma.worker.updateMany({
    where: { organizationId: org.id, category: 'VISITOR', deletedAt: null },
    data: { status: 'ACTIVE', joinDate: workDateFor(0), exitDate: null },
  });

  const people = await prisma.worker.findMany({
    where: { organizationId: org.id, deletedAt: null, status: 'ACTIVE' },
    select: {
      id: true,
      category: true,
      assignments: { where: { endDate: null }, select: { siteId: true }, take: 1 },
    },
  });
  if (people.length === 0) throw new Error('No people — run seed-demo.ts first.');

  const firstSite = await prisma.site.findFirst({
    where: { organizationId: org.id, isActive: true },
    select: { id: true },
  });
  if (!firstSite) throw new Error('No active site.');
  const siteOf = (p: (typeof people)[number]) => p.assignments[0]?.siteId ?? firstSite.id;

  // 1. Auto-close stale OPEN sessions from before today (what the monitor does).
  const today0 = workDateFor(0);
  const stale = await prisma.attendanceSession.findMany({
    where: { organizationId: org.id, state: 'OPEN', workDate: { lt: today0 } },
    select: { id: true, loginAt: true },
  });
  for (const s of stale) {
    await prisma.attendanceSession.update({
      where: { id: s.id },
      data: {
        state: 'AUTO_CLOSED',
        logoutAt: new Date(s.loginAt.getTime() + AUTO_CREDIT_MINUTES * 60_000),
        workedMinutes: AUTO_CREDIT_MINUTES,
        overtimeMinutes: 0,
        closedReason: 'no logout — auto-closed with 8h credited',
      },
    });
  }
  console.log(`Auto-closed ${stale.length} stale OPEN session(s).`);

  // 2. Clear today's + yesterday's sessions so we rebuild a clean snapshot.
  const del = await prisma.attendanceSession.deleteMany({
    where: { organizationId: org.id, workDate: { in: [workDateFor(0), workDateFor(1)] } },
  });
  console.log(`Cleared ${del.count} existing session(s) for today/yesterday.`);

  const workersStaff = people.filter((p) => p.category !== 'VISITOR');
  const visitors = people.filter((p) => p.category === 'VISITOR');

  // 3. Yesterday — mostly CLOSED; force a handful of AUTO_CLOSED (missed logout).
  const missedTargets = new Set<string>();
  const workers = workersStaff.filter((p) => p.category === 'WORKER');
  const staff = workersStaff.filter((p) => p.category === 'STAFF');
  workers.slice(0, 5).forEach((p) => missedTargets.add(p.id));
  staff.slice(0, 2).forEach((p) => missedTargets.add(p.id));

  let yClosed = 0;
  let yMissed = 0;
  for (const p of workersStaff) {
    if (rand() < 0.12) continue; // ~88% attendance
    const isStaff = p.category === 'STAFF';
    const login = isStaff ? istDate(1, 9, between(0, 30)) : istDate(1, between(7, 8), between(30, 59));

    if (missedTargets.has(p.id)) {
      await prisma.attendanceSession.create({
        data: {
          organizationId: org.id,
          workerId: p.id,
          siteId: siteOf(p),
          workDate: workDateFor(1),
          loginAt: login,
          logoutAt: new Date(login.getTime() + AUTO_CREDIT_MINUTES * 60_000),
          state: 'AUTO_CLOSED',
          workedMinutes: AUTO_CREDIT_MINUTES,
          overtimeMinutes: 0,
          closedReason: 'no logout — auto-closed with 8h credited',
        },
      });
      yMissed++;
      continue;
    }

    const logout = isStaff ? istDate(1, 18, between(0, 45)) : istDate(1, between(17, 19), between(0, 59));
    const worked = Math.round((logout.getTime() - login.getTime()) / 60000);
    await prisma.attendanceSession.create({
      data: {
        organizationId: org.id,
        workerId: p.id,
        siteId: siteOf(p),
        workDate: workDateFor(1),
        loginAt: login,
        logoutAt: logout,
        state: 'CLOSED',
        workedMinutes: worked,
        overtimeMinutes: Math.max(0, worked - 480),
      },
    });
    yClosed++;
  }
  console.log(`Yesterday: ${yClosed} closed, ${yMissed} missed-logout (auto-closed).`);

  // 4. Today — mix of still-OPEN (on site now) and already CLOSED.
  let tOpen = 0;
  let tClosed = 0;
  for (const p of workersStaff) {
    if (rand() < 0.15) continue; // ~85% attend
    const isStaff = p.category === 'STAFF';
    const login = isStaff ? istDate(0, 9, between(0, 40)) : istDate(0, between(7, 9), between(0, 59));

    if (rand() < 0.7) {
      // Still on site.
      await prisma.attendanceSession.create({
        data: {
          organizationId: org.id,
          workerId: p.id,
          siteId: siteOf(p),
          workDate: workDateFor(0),
          loginAt: login,
          state: 'OPEN',
        },
      });
      tOpen++;
    } else {
      // Logged in and already out (short shift / left early).
      const logout = new Date(login.getTime() + between(180, 420) * 60_000);
      const worked = Math.round((logout.getTime() - login.getTime()) / 60000);
      await prisma.attendanceSession.create({
        data: {
          organizationId: org.id,
          workerId: p.id,
          siteId: siteOf(p),
          workDate: workDateFor(0),
          loginAt: login,
          logoutAt: logout,
          state: 'CLOSED',
          workedMinutes: worked,
          overtimeMinutes: Math.max(0, worked - 480),
        },
      });
      tClosed++;
    }
  }

  // A couple of visitors on site today.
  for (const v of visitors.slice(0, 2)) {
    await prisma.attendanceSession.create({
      data: {
        organizationId: org.id,
        workerId: v.id,
        siteId: siteOf(v),
        workDate: workDateFor(0),
        loginAt: istDate(0, between(10, 12), between(0, 59)),
        state: 'OPEN',
      },
    });
    tOpen++;
  }
  console.log(`Today: ${tOpen} on site now, ${tClosed} logged in & out.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
