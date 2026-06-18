/**
 * One-time backfill: encrypt existing plaintext Worker.bankAccountNumber into
 * bankAccountCiphertext / bankAccountLast4, then null the plaintext column.
 *
 * Run AFTER `prisma db push` adds the new columns, BEFORE dropping the legacy
 * bank_account_number column. Requires DATABASE_URL + DATA_ENCRYPTION_KEY in env
 * (same key the API uses). From backend/:
 *
 *   DATABASE_URL=... DATA_ENCRYPTION_KEY=... npx ts-node prisma/backfill-encrypt-bank.ts
 *
 * Idempotent: skips rows that already have a ciphertext.
 */
import { PrismaClient } from '@prisma/client';
import { CryptoService } from '../src/common/crypto/crypto.service';

async function main() {
  const prisma = new PrismaClient();
  const crypto = new CryptoService();

  const rows = await prisma.worker.findMany({
    where: { bankAccountNumber: { not: null }, bankAccountCiphertext: null },
    select: { id: true, bankAccountNumber: true },
  });
  console.log(`Found ${rows.length} worker(s) with plaintext bank account to encrypt.`);

  let done = 0;
  for (const r of rows) {
    const acct = (r.bankAccountNumber ?? '').replace(/\s/g, '');
    if (!acct) continue;
    await prisma.worker.update({
      where: { id: r.id },
      data: {
        bankAccountCiphertext: crypto.encrypt(acct),
        bankAccountLast4: acct.slice(-4),
        bankAccountNumber: null, // clear the plaintext source
      },
    });
    done++;
  }
  console.log(`Encrypted ${done} bank account number(s). Plaintext cleared.`);
  console.log('Next: remove bank_account_number from schema.prisma and re-run prisma db push.');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
