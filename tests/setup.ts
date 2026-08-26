import path from 'node:path';

process.env.SESSION_SECRET ||= 'test-session-secret-please-override-in-prod-0123456789';
process.env.CERT_HASH_SECRET ||= 'test-cert-hash-secret-please-override-in-prod-9876543210';
process.env.DATABASE_URL ||= `file:${path.resolve(__dirname, 'test.db')}`;
process.env.NEXT_PUBLIC_APP_URL ||= 'https://verify.example.com';
