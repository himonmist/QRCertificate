import { copyFileSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const sourceDb = path.resolve(__dirname, '..', 'prisma', 'dev.db');
const testDb = path.resolve(__dirname, 'test.db');

export default async function setup() {
  if (!existsSync(sourceDb)) {
    throw new Error('prisma/dev.db not found — run `npx prisma migrate dev` before testing');
  }
  copyFileSync(sourceDb, testDb);

  return async () => {
    for (const file of [testDb, `${testDb}-journal`]) {
      if (existsSync(file)) unlinkSync(file);
    }
  };
}
