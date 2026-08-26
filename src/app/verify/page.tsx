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
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 text-center">
      <h1 className="mb-2 text-2xl font-bold text-brand-700">Verify a Certificate</h1>
      <p className="mb-6 text-sm text-gray-600">
        Scan the QR code on the certificate, or enter the certificate ID below.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          value={uid}
          onChange={(e) => setUid(e.target.value)}
          placeholder="e.g. MNC-2026-SDA-000123"
          className="w-full rounded-md border border-gray-300 px-3 py-2.5 text-center text-sm tracking-wide focus:border-brand-600 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-md bg-brand-600 px-4 py-2.5 font-medium text-white hover:bg-brand-700"
        >
          Verify
        </button>
      </form>
    </main>
  );
}
