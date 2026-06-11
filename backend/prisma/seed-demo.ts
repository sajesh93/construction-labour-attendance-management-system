/**
 * Demo data seeder — designations, vendors, workers/staff/visitors and two
 * weeks of attendance, so the dashboard/reports look alive for client demos.
 *
 * Run: npx ts-node prisma/seed-demo.ts   (DATABASE_URL must point at the DB)
 * Idempotent: refuses to run twice (guards on the demo vendor code).
 */
import { PersonCategory, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DESIGNATIONS = [
  'Mason',
  'Electrician',
  'Plumber',
  'Carpenter',
  'Welder',
  'Painter',
  'Steel Fixer',
  'Bar Bender',
  'Helper',
  'Crane Operator',
  'Site Engineer',
  'Storekeeper',
  'Security Guard',
];

const VENDORS = [
  { name: 'BuildRight Constructions', code: 'BRC', contactPerson: 'Senthil Kumar', contactNumber: '9840012345' },
  { name: 'SK Manpower Services', code: 'SKM', contactPerson: 'Shanmugam K', contactNumber: '9884455667' },
  { name: 'Annai Infra Works', code: 'ANNAI', contactPerson: 'Revathi M', contactNumber: '9790098765' },
  { name: 'Velan Engineering', code: 'VELAN', contactPerson: 'Velan P', contactNumber: '9952211334' },
];

// [name, fatherName, gender, designation, vendorCode]
const WORKERS: [string, string, string, string, string][] = [
  ['Murugan S', 'Subramani', 'M', 'Mason', 'BRC'],
  ['Selvam K', 'Kandasamy', 'M', 'Mason', 'BRC'],
  ['Arumugam P', 'Palanisamy', 'M', 'Mason', 'SKM'],
  ['Kannan R', 'Raman', 'M', 'Electrician', 'VELAN'],
  ['Sakthivel M', 'Mariappan', 'M', 'Electrician', 'VELAN'],
  ['Suresh Babu', 'Krishnan', 'M', 'Plumber', 'ANNAI'],
  ['Ramesh Yadav', 'Sitaram Yadav', 'M', 'Plumber', 'SKM'],
  ['Karthik V', 'Venkatesan', 'M', 'Carpenter', 'BRC'],
  ['Dinesh Kumar', 'Rajendran', 'M', 'Carpenter', 'BRC'],
  ['Mohammed Irfan', 'Abdul Rahim', 'M', 'Welder', 'VELAN'],
  ['Santosh Kumar', 'Ramprasad', 'M', 'Welder', 'SKM'],
  ['Saravanan T', 'Thangavel', 'M', 'Painter', 'ANNAI'],
  ['Vijay Anand', 'Anandan', 'M', 'Painter', 'ANNAI'],
  ['Bablu Sahani', 'Mahesh Sahani', 'M', 'Steel Fixer', 'SKM'],
  ['Muthu Krishnan', 'Krishnamoorthy', 'M', 'Steel Fixer', 'BRC'],
  ['Palani Swamy', 'Chinnasamy', 'M', 'Bar Bender', 'BRC'],
  ['Senthil Nathan', 'Nataraj', 'M', 'Bar Bender', 'SKM'],
  ['Anbu Selvan', 'Selvaraj', 'M', 'Helper', 'SKM'],
  ['Bala Murugan', 'Murugesan', 'M', 'Helper', 'ANNAI'],
  ['Lakshmi Devi', 'Govindan', 'F', 'Helper', 'ANNAI'],
  ['Kavitha R', 'Ramasamy', 'F', 'Helper', 'SKM'],
  ['Ravi Chandran', 'Chandrasekar', 'M', 'Crane Operator', 'VELAN'],
  ['Ilango M', 'Manickam', 'M', 'Mason', 'ANNAI'],
  ['Ganesh Moorthy', 'Moorthy', 'M', 'Electrician', 'BRC'],
];

const STAFF: [string, string, string, string][] = [
  ['Priya Raman', 'F', 'Site Engineer', 'BRC'],
  ['Arvind Krishnan', 'M', 'Site Engineer', 'VELAN'],
  ['Deepak Sharma', 'M', 'Storekeeper', 'BRC'],
  ['Meena Kumari', 'F', 'Storekeeper', 'ANNAI'],
  ['Rajesh Khanna', 'M', 'Security Guard', 'SKM'],
  ['Vetri Selvan', 'M', 'Security Guard', 'SKM'],
];

const VISITORS: [string, string, string][] = [
  ['Rajiv Menon', 'M', 'BRC'],
  ['Anita Desai', 'F', 'ANNAI'],
  ['Vikram Shetty', 'M', 'VELAN'],
];

const BLOOD_GROUPS = ['A+', 'B+', 'O+', 'AB+', 'O-', 'B-'];

// Deterministic PRNG so reruns on a fresh DB give identical data.
let seed = 42;
function rand(): number {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const between = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

/** A Date for IST wall-clock time on a given day offset from today. */
function istDate(daysAgo: number, hour: number, minute: number): Date {
  const now = new Date();
  const istNow = new Date(now.getTime() + 5.5 * 3600_000);
  const day = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate() - daysAgo));
  return new Date(day.getTime() + (hour - 5.5) * 3600_000 + minute * 60_000);
}

function workDateFor(daysAgo: number): Date {
  const now = new Date();
  const istNow = new Date(now.getTime() + 5.5 * 3600_000);
  return new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate() - daysAgo));
}

async function main() {
  const org = await prisma.organization.findFirst({ where: { isActive: true } });
  if (!org) throw new Error('No organization found — run the base seed first.');

  const existingDemo = await prisma.vendor.findFirst({
    where: { organizationId: org.id, code: 'BRC' },
  });
  if (existingDemo) {
    console.log('Demo data already present (vendor BRC exists) — nothing to do.');
    return;
  }

  const sites = await prisma.site.findMany({ where: { organizationId: org.id, isActive: true } });
  if (sites.length === 0) throw new Error('No active sites — create a site first.');

  // Designations
  const designationByName = new Map<string, string>();
  for (const name of DESIGNATIONS) {
    const d = await prisma.designation.upsert({
      where: { organizationId_name: { organizationId: org.id, name } },
      update: {},
      create: { organizationId: org.id, name },
    });
    designationByName.set(name, d.id);
  }

  // Vendors
  const vendorByCode = new Map<string, string>();
  for (const v of VENDORS) {
    const vendor = await prisma.vendor.upsert({
      where: { organizationId_code: { organizationId: org.id, code: v.code } },
      update: {},
      create: { organizationId: org.id, ...v },
    });
    vendorByCode.set(v.code, vendor.id);
  }

  const usedCodes = new Set(
    (
      await prisma.worker.findMany({
        where: { organizationId: org.id },
        select: { workerCode: true },
      })
    ).map((w) => w.workerCode),
  );
  const nextCode = (prefix: string, start: number): string => {
    let n = start;
    while (usedCodes.has(`${prefix}-${String(n).padStart(4, '0')}`)) n++;
    const code = `${prefix}-${String(n).padStart(4, '0')}`;
    usedCodes.add(code);
    return code;
  };

  type Person = { id: string; category: PersonCategory; siteId: string };
  const people: Person[] = [];

  const createPerson = async (input: {
    name: string;
    father?: string;
    gender: string;
    designation?: string;
    vendorCode: string;
    category: PersonCategory;
    codePrefix: string;
    codeStart: number;
    siteIdx: number;
  }) => {
    const site = sites[input.siteIdx % sites.length];
    const joinDaysAgo = between(30, 400);
    const w = await prisma.worker.create({
      data: {
        organizationId: org.id,
        workerCode: nextCode(input.codePrefix, input.codeStart),
        fullName: input.name,
        fatherName: input.father,
        gender: input.gender,
        dateOfBirth: new Date(Date.UTC(between(1975, 2003), between(0, 11), between(1, 28))),
        language: pick(['Tamil', 'Tamil', 'Hindi', 'Telugu']),
        mobileNumber: `9${between(600000000, 999999999)}`,
        pincode: pick(['630202', '600028', '600041', '625001']),
        bloodGroup: pick(BLOOD_GROUPS),
        emergencyContactName: input.father ?? 'Family',
        emergencyContactNumber: `9${between(600000000, 999999999)}`,
        category: input.category,
        designationId: input.designation ? designationByName.get(input.designation) : undefined,
        vendorId: vendorByCode.get(input.vendorCode),
        natureOfContractor: input.category === 'WORKER' ? pick(['D&B', 'Labour supply', 'Specialist']) : undefined,
        joinDate: workDateFor(joinDaysAgo),
        status: 'ACTIVE',
        assignments: {
          create: { siteId: site.id, vendorId: vendorByCode.get(input.vendorCode), startDate: workDateFor(joinDaysAgo) },
        },
      },
    });
    people.push({ id: w.id, category: input.category, siteId: site.id });
  };

  for (let i = 0; i < WORKERS.length; i++) {
    const [name, father, gender, designation, vendor] = WORKERS[i];
    await createPerson({
      name, father, gender, designation, vendorCode: vendor,
      category: 'WORKER', codePrefix: 'W', codeStart: 1001, siteIdx: i,
    });
  }
  for (let i = 0; i < STAFF.length; i++) {
    const [name, gender, designation, vendor] = STAFF[i];
    await createPerson({
      name, gender, designation, vendorCode: vendor,
      category: 'STAFF', codePrefix: 'S', codeStart: 1001, siteIdx: i,
    });
  }
  for (let i = 0; i < VISITORS.length; i++) {
    const [name, gender, vendor] = VISITORS[i];
    await createPerson({
      name, gender, vendorCode: vendor,
      category: 'VISITOR', codePrefix: 'V', codeStart: 1001, siteIdx: i,
    });
  }
  console.log(`Created ${people.length} people across ${sites.length} site(s).`);

  // ---- Attendance: last 14 days ----
  let sessions = 0;
  for (const p of people) {
    if (p.category === 'VISITOR') {
      // 1-2 short visits in the past week.
      for (let i = 0; i < between(1, 2); i++) {
        const daysAgo = between(1, 7);
        const inH = between(10, 14);
        const login = istDate(daysAgo, inH, between(0, 59));
        const logout = istDate(daysAgo, inH + between(1, 3), between(0, 59));
        const worked = Math.round((logout.getTime() - login.getTime()) / 60000);
        await prisma.attendanceSession.create({
          data: {
            organizationId: org.id, workerId: p.id, siteId: p.siteId,
            workDate: workDateFor(daysAgo), loginAt: login, logoutAt: logout,
            state: 'CLOSED', workedMinutes: worked, overtimeMinutes: 0,
            lateMinutes: 0, earlyLeaveMinutes: 0,
          },
        });
        sessions++;
      }
      continue;
    }

    for (let daysAgo = 14; daysAgo >= 0; daysAgo--) {
      const dow = workDateFor(daysAgo).getUTCDay();
      if (dow === 0 && rand() < 0.8) continue; // most skip Sundays
      if (rand() < 0.12) continue; // ~88% attendance

      const isStaff = p.category === 'STAFF';
      const login = isStaff
        ? istDate(daysAgo, 9, between(0, 40))
        : istDate(daysAgo, between(7, 8), between(30, 59));

      if (daysAgo === 0) {
        // Today: most are still on site (live dashboard).
        if (rand() < 0.75) {
          await prisma.attendanceSession.create({
            data: {
              organizationId: org.id, workerId: p.id, siteId: p.siteId,
              workDate: workDateFor(0), loginAt: login, state: 'OPEN',
            },
          });
          sessions++;
        }
        continue;
      }

      const logout = isStaff
        ? istDate(daysAgo, 18, between(0, 45))
        : istDate(daysAgo, between(17, 19), between(0, 59));
      const worked = Math.round((logout.getTime() - login.getTime()) / 60000);
      const overtime = Math.max(0, worked - 480);
      await prisma.attendanceSession.create({
        data: {
          organizationId: org.id, workerId: p.id, siteId: p.siteId,
          workDate: workDateFor(daysAgo), loginAt: login, logoutAt: logout,
          state: 'CLOSED', workedMinutes: worked, overtimeMinutes: overtime,
          lateMinutes: 0, earlyLeaveMinutes: 0,
        },
      });
      sessions++;
    }
  }
  console.log(`Created ${sessions} attendance sessions (last 14 days, some OPEN today).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
