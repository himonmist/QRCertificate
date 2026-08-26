import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="flex items-center gap-2">
        <div style={{ width: 16, height: 16, background: 'var(--color-accent)' }} />
        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 14 }}>
          QRCertificate
        </span>
      </div>
      <h1>QR-verified training certificates.</h1>
      <p className="text-muted">
        Issue tamper-evident training certificates and let anyone verify them instantly by QR
        code — no login required.
      </p>
      <div className="flex gap-3">
        <Link href="/verify" className="btn btn-primary">
          Verify a Certificate
        </Link>
        <Link href="/login" className="btn btn-secondary">
          Admin Login
        </Link>
      </div>
    </main>
  );
}
