'use client';

import { useEffect, useState } from 'react';

interface Certificate {
  id: string;
  certificateUid: string;
  status: 'active' | 'revoked' | 'superseded';
  issuedAt: string;
  participant: { fullName: string };
  program: { title: string };
}

export default function CertificatesPage() {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState('');

  async function load() {
    const query = new URLSearchParams();
    if (q) query.set('q', q);
    if (status) query.set('status', status);
    const res = await fetch(`/api/certificates?${query.toString()}`);
    if (res.ok) setCertificates((await res.json()).certificates);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRevoke(uid: string) {
    setError(null);
    const res = await fetch(`/api/certificates/${uid}/revoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: revokeReason }),
    });
    if (!res.ok) {
      setError((await res.json()).error);
      return;
    }
    setRevokeTarget(null);
    setRevokeReason('');
    load();
  }

  async function handleReissue(uid: string) {
    setError(null);
    const res = await fetch(`/api/certificates/${uid}/reissue`, { method: 'POST' });
    if (!res.ok) {
      setError((await res.json()).error);
      return;
    }
    load();
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Certificates</h1>

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          placeholder="Search by name or certificate ID"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="input w-72"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="revoked">Revoked</option>
          <option value="superseded">Superseded</option>
        </select>
        <button onClick={load} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
          Search
        </button>
      </div>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Certificate ID</th>
              <th className="px-4 py-3">Participant</th>
              <th className="px-4 py-3">Program</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {certificates.map((cert) => (
              <tr key={cert.id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-mono text-xs">{cert.certificateUid}</td>
                <td className="px-4 py-3">{cert.participant.fullName}</td>
                <td className="px-4 py-3">{cert.program.title}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      cert.status === 'active'
                        ? 'bg-green-100 text-green-700'
                        : cert.status === 'revoked'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {cert.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-xs">
                  <a
                    href={`/api/certificates/${cert.certificateUid}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="mr-3 font-medium text-brand-700 hover:underline"
                  >
                    PDF
                  </a>
                  <a
                    href={`/verify/${cert.certificateUid}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mr-3 font-medium text-brand-700 hover:underline"
                  >
                    Verify Page
                  </a>
                  {cert.status === 'active' && (
                    <>
                      {revokeTarget === cert.certificateUid ? (
                        <span className="inline-flex items-center gap-2">
                          <input
                            placeholder="Reason"
                            value={revokeReason}
                            onChange={(e) => setRevokeReason(e.target.value)}
                            className="input h-7 w-32 text-xs"
                          />
                          <button onClick={() => handleRevoke(cert.certificateUid)} className="font-medium text-red-700 hover:underline">
                            Confirm
                          </button>
                        </span>
                      ) : (
                        <button onClick={() => setRevokeTarget(cert.certificateUid)} className="mr-3 font-medium text-red-700 hover:underline">
                          Revoke
                        </button>
                      )}
                    </>
                  )}
                  {cert.status !== 'superseded' && (
                    <button onClick={() => handleReissue(cert.certificateUid)} className="font-medium text-gray-700 hover:underline">
                      Reissue
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {certificates.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                  No certificates found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
