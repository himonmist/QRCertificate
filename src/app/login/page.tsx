'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

const FEATURES = [
  'Tamper-evident SHA-256 certificate hashing',
  'Instant no-login QR verification',
  'Full revoke, reissue & audit trail',
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error ?? 'Login failed');
        return;
      }
      router.push('/admin/dashboard');
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen">
      <section
        className="hidden w-1/2 flex-col justify-between p-8 lg:flex"
        style={{ background: 'var(--color-text)', color: 'var(--color-bg)' }}
      >
        <div className="flex items-center gap-2">
          <div style={{ width: 16, height: 16, background: 'var(--color-accent)' }} />
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 14 }}>
            QRCertificate
          </span>
        </div>
        <div>
          <h1 className="mb-4" style={{ color: 'var(--color-bg)' }}>
            Certificates that verify themselves.
          </h1>
          <p style={{ opacity: 0.75, fontSize: 14, maxWidth: 420 }}>
            Issue tamper-evident training certificates with an embedded QR code that anyone can
            verify in seconds — no login, no lookup account, no doubt.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            {FEATURES.map((feature) => (
              <div key={feature} className="flex items-center gap-2" style={{ fontSize: 13, opacity: 0.85 }}>
                <div style={{ width: 6, height: 6, background: 'var(--color-accent)' }} />
                {feature}
              </div>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 12, opacity: 0.5 }}>
          &copy; {new Date().getFullYear()} QRCertificate
        </div>
      </section>

      <section className="flex w-full flex-col items-center justify-center px-4 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="card-kicker mb-1">QRCertificate</div>
          <h2 className="mb-1">Admin sign in</h2>
          <p className="text-muted mb-6" style={{ fontSize: 13 }}>
            Sign in with your administrator credentials to manage trainers, programs and
            certificates.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
              />
            </div>

            {error && (
              <p style={{ color: 'var(--color-accent-700)', fontSize: 13, margin: 0 }}>{error}</p>
            )}

            <button type="submit" disabled={loading} className="btn btn-primary btn-block" style={{ justifyContent: 'center' }}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="hr" />
          <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
            This is a restricted administrator area. All sign-in attempts are logged.
          </p>
        </div>
      </section>
    </main>
  );
}
