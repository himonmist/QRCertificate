import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/qrcertificate';

function loadDotEnvDatabaseUrl(): string | undefined {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!existsSync(envPath)) return undefined;
  const content = readFileSync(envPath, 'utf-8');
  const match = content.match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?\s*$/m);
  return match?.[1];
}

/**
 * Base DATABASE_URL for local/dev use (points at the real dev database).
 * Read once here — outside of Next's runtime, which loads .env itself —
 * so both globalSetup (main process) and setup.ts (per test-file worker)
 * derive the identical test database name without relying on env vars
 * propagating between them.
 */
export function getBaseDatabaseUrl(): string {
  return process.env.DATABASE_URL || loadDotEnvDatabaseUrl() || DEFAULT_DATABASE_URL;
}

function withDbName(urlStr: string, dbName: string): string {
  const url = new URL(urlStr);
  url.pathname = `/${dbName}`;
  return url.toString();
}

export function getTestDatabaseName(): string {
  const base = getBaseDatabaseUrl();
  const dbName = new URL(base).pathname.slice(1) || 'qrcertificate';
  return `${dbName}_test`;
}

/** A throwaway sibling database, isolated from the real dev database. */
export function getTestDatabaseUrl(): string {
  return withDbName(getBaseDatabaseUrl(), getTestDatabaseName());
}

/** Connects to the default 'postgres' maintenance database to run CREATE/DROP DATABASE. */
export function getAdminDatabaseUrl(): string {
  return withDbName(getBaseDatabaseUrl(), 'postgres');
}
