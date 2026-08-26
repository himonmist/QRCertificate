import { execSync } from 'node:child_process';
import { getAdminDatabaseUrl, getTestDatabaseUrl, getTestDatabaseName } from './dbUrl';

export default async function setup() {
  const adminUrl = getAdminDatabaseUrl();
  const testUrl = getTestDatabaseUrl();
  const testDbName = getTestDatabaseName();

  execSync(`psql "${adminUrl}" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${testDbName}"`, {
    stdio: 'inherit',
  });
  execSync(`psql "${adminUrl}" -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${testDbName}"`, {
    stdio: 'inherit',
  });
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: testUrl },
  });

  return async () => {
    execSync(`psql "${adminUrl}" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${testDbName}"`, {
      stdio: 'ignore',
    });
  };
}
