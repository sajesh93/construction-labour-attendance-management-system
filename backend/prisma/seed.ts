import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const orgCode = process.env.SEED_ORG_CODE ?? 'DEFAULT';
  const org = await prisma.organization.upsert({
    where: { code: orgCode },
    update: {},
    create: {
      name: process.env.SEED_ORG_NAME ?? 'Default Organization',
      code: orgCode,
      timezone: process.env.SEED_ORG_TIMEZONE ?? 'Asia/Kolkata',
    },
  });

  const email = process.env.SEED_SUPERADMIN_EMAIL ?? 'admin@clams.local';
  const password = process.env.SEED_SUPERADMIN_PASSWORD ?? 'ChangeMe123!';
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      organizationId: org.id,
      role: 'SUPER_ADMIN',
      fullName: 'Super Admin',
      email,
      passwordHash,
    },
  });

  // eslint-disable-next-line no-console
  console.log(`Seeded org "${org.code}" and super admin "${email}"`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
