import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-3xl font-bold text-brand-700">QRCertificate</h1>
      <p className="text-gray-600">
        QR-verified training certificate generation and public verification platform.
      </p>
      <div className="flex gap-4">
        <Link
          href="/verify"
          className="rounded-md bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-700"
        >
          Verify a Certificate
        </Link>
        <Link
          href="/login"
          className="rounded-md border border-gray-300 px-5 py-2.5 font-medium text-gray-700 hover:bg-gray-100"
        >
          Admin Login
        </Link>
      </div>
    </main>
  );
}
