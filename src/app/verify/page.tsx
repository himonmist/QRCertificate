'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function VerifySearchPage() {
  const router = useRouter();
  const [uid, setUid] = useState('');

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = uid.trim();
    if (trimmed) router.push(`/verify/${encodeURIComponent(trimmed)}`);
  }

  return (
    <div className="flex min-h-screen flex-col" style={{ background: 'var(--color-bg)' }}>
      <header className="flex items-center gap-2 px-4 py-4" style={{ borderBottom: '2px solid var(--color-divider)' }}>
        <div style={{ width: 16, height: 16, background: 'var(--color-accent)' }} />
        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 14 }}>
          QRCertificate — Certificate Verification
        </span>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-6">
        <div className="w-full text-center" style={{ maxWidth: 420 }}>
          <h1 className="mb-2">Verify a certificate</h1>
          <p className="text-muted mb-6" style={{ fontSize: 13 }}>
            Scan the QR code on the certificate, or enter its ID below.
          </p>
          <form onSubmit={handleSubmit}>
            <div className="field" style={{ textAlign: 'left' }}>
              <label htmlFor="uid">Certificate ID</label>
              <input
                id="uid"
                value={uid}
                onChange={(e) => setUid(e.target.value)}
                placeholder="MNC-2026-SDA-000123"
                className="input"
                style={{ textAlign: 'center', letterSpacing: '0.04em' }}
              />
            </div>
            <button type="submit" className="btn btn-primary btn-block" style={{ justifyContent: 'center' }}>
              Verify
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
