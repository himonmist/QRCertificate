import { getTestDatabaseUrl } from './dbUrl';

process.env.SESSION_SECRET ||= 'test-session-secret-please-override-in-prod-0123456789';
process.env.CERT_HASH_SECRET ||= 'test-cert-hash-secret-please-override-in-prod-9876543210';
// Always the throwaway *_test sibling database (never the real dev DB),
// derived the same way globalSetup.ts derives it — see tests/dbUrl.ts.
process.env.DATABASE_URL = getTestDatabaseUrl();
process.env.NEXT_PUBLIC_APP_URL ||= 'https://verify.example.com';
