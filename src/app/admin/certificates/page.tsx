'use client';

import { useEffect, useMemo, useState } from 'react';

interface Certificate {
  id: string;
  certificateUid: string;
  status: 'active' | 'revoked' | 'superseded';
  issuedAt: string;
  participant: { fullName: string };
  program: { id: string; title: string };
}

interface Program {
  id: string;
  title: string;
}

const STATUS_TAG: Record<Certificate['status'], string> = {
  active: 'tag-accent',
  revoked: 'tag-outline',
  superseded: 'tag-neutral',
};

function toCsv(certificates: Certificate[]): string {
  const header = ['Certificate ID', 'Participant', 'Program', 'Status', 'Issued'];
  const rows = certificates.map((c) => [
    c.certificateUid,
    c.participant.fullName,
    c.program.title,
    c.status,
    c.issuedAt.slice(0, 10),
  ]);
  return [header, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

/** Groups certificates by program, preserving the API's most-recent-first order both across and within groups. */
function groupByProgram(certificates: Certificate[]): { program: Certificate['program']; certificates: Certificate[] }[] {
  const order: string[] = [];
  const groups = new Map<string, { program: Certificate['program']; certificates: Certificate[] }>();
  for (const cert of certificates) {
    if (!groups.has(cert.program.id)) {
      groups.set(cert.program.id, { program: cert.program, certificates: [] });
      order.push(cert.program.id);
    }
    groups.get(cert.program.id)!.certificates.push(cert);
  }
  return order.map((id) => groups.get(id)!);
}

export default function CertificatesPage() {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [programId, setProgramId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState('');

  async function load() {
    const query = new URLSearchParams();
    if (q) query.set('q', q);
    if (status) query.set('status', status);
    if (programId) query.set('program_id', programId);
    const res = await fetch(`/api/certificates?${query.toString()}`);
    if (res.ok) setCertificates((await res.json()).certificates);
  }

  useEffect(() => {
    load();
    fetch('/api/programs')
      .then((res) => (res.ok ? res.json() : { programs: [] }))
      .then((body) => setPrograms(body.programs ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = useMemo(() => groupByProgram(certificates), [certificates]);

  async function handleRevoke() {
    if (!revokeTarget) return;
    setError(null);
    const res = await fetch(`/api/certificates/${revokeTarget}/revoke`, {
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

  function handleExport() {
    const csv = toCsv(certificates);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'certificates.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <h1 className="mb-6">Certificates</h1>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          placeholder="Search by name or certificate ID"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="input"
          style={{ maxWidth: 320 }}
        />
        <select value={programId} onChange={(e) => setProgramId(e.target.value)} className="input" style={{ maxWidth: 220 }}>
          <option value="">All programs</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input" style={{ maxWidth: 180 }}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="revoked">Revoked</option>
          <option value="superseded">Superseded</option>
        </select>
        <button onClick={load} className="btn btn-secondary">
          Search
        </button>
        <button onClick={handleExport} className="btn btn-ghost" style={{ marginLeft: 'auto' }}>
          Export CSV
        </button>
      </div>
      {error && <p className="mb-4" style={{ color: 'var(--color-accent-700)', fontSize: 13 }}>{error}</p>}

      {groups.length === 0 && <p className="text-muted">No certificates found.</p>}

      <div className="flex flex-col gap-6">
        {groups.map((group) => (
          <div key={group.program.id}>
            <div className="mb-2 flex items-center gap-2">
              <h5 style={{ margin: 0 }}>{group.program.title}</h5>
              <span className="tag tag-neutral">{group.certificates.length}</span>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Certificate ID</th>
                  <th>Participant</th>
                  <th>Status</th>
                  <th>Issued</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {group.certificates.map((cert) => (
                  <tr key={cert.id}>
                    <td style={{ fontFamily: 'var(--font-heading)', fontSize: 12 }}>{cert.certificateUid}</td>
                    <td>{cert.participant.fullName}</td>
                    <td>
                      <span className={`tag ${STATUS_TAG[cert.status]}`}>{cert.status}</span>
                    </td>
                    <td>{cert.issuedAt.slice(0, 10)}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <a href={`/api/certificates/${cert.certificateUid}/pdf`} target="_blank" rel="noreferrer" className="btn btn-ghost">
                        PDF
                      </a>
                      <a href={`/verify/${cert.certificateUid}`} target="_blank" rel="noreferrer" className="btn btn-ghost">
                        Verify page
                      </a>
                      {cert.status === 'active' && (
                        <button
                          onClick={() => {
                            setRevokeTarget(cert.certificateUid);
                            setRevokeReason('');
                          }}
                          className="btn btn-ghost"
                          style={{ color: 'var(--color-accent-700)' }}
                        >
                          Revoke
                        </button>
                      )}
                      {cert.status !== 'superseded' && (
                        <button onClick={() => handleReissue(cert.certificateUid)} className="btn btn-ghost">
                          Reissue
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {revokeTarget && (
        <div className="dialog-backdrop" onClick={() => setRevokeTarget(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">Revoke certificate</div>
            <p className="dialog-body">
              This will mark certificate <strong>{revokeTarget}</strong> as revoked. Its public
              verification page will show the revocation and reason to anyone who checks it. This
              cannot be undone directly — the certificate would need to be reissued.
            </p>
            <div className="field">
              <label>Reason</label>
              <input
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                className="input"
                autoFocus
              />
            </div>
            <div className="dialog-actions">
              <button className="btn btn-secondary" onClick={() => setRevokeTarget(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleRevoke}>
                Confirm revoke
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
