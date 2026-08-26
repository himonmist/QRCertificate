'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface Stats {
  totalPrograms: number;
  totalTrainers: number;
  totalParticipants: number;
  totalCertificates: number;
  certificatesByStatus: { active: number; revoked: number; superseded: number };
  totalScans: number;
}

interface Certificate {
  id: string;
  certificateUid: string;
  status: 'active' | 'revoked' | 'superseded';
  issuedAt: string;
  participant: { fullName: string };
  program: { title: string };
}

const STATUS_TAG: Record<Certificate['status'], string> = {
  active: 'tag-accent',
  revoked: 'tag-outline',
  superseded: 'tag-neutral',
};

const QUICK_LINKS = [
  { href: '/admin/trainers', label: 'Trainers' },
  { href: '/admin/programs', label: 'Training programs' },
  { href: '/admin/certificates', label: 'Certificates' },
  { href: '/admin/templates', label: 'Templates' },
];

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<Certificate[]>([]);

  useEffect(() => {
    fetch('/api/dashboard/stats')
      .then((res) => res.json())
      .then(setStats)
      .catch(() => setStats(null));
    fetch('/api/certificates')
      .then((res) => res.json())
      .then((body) => setRecent((body.certificates ?? []).slice(0, 5)))
      .catch(() => setRecent([]));
  }, []);

  const kpis = stats
    ? [
        { label: 'Training programs', value: stats.totalPrograms },
        { label: 'Trainers', value: stats.totalTrainers },
        { label: 'Participants', value: stats.totalParticipants },
        { label: 'Certificates issued', value: stats.totalCertificates },
        { label: 'Active certificates', value: stats.certificatesByStatus.active },
        { label: 'Verification scans', value: stats.totalScans },
      ]
    : [];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 style={{ margin: 0 }}>Dashboard</h1>
        <Link href="/admin/programs" className="btn btn-primary">
          + New program
        </Link>
      </div>

      {!stats && <p className="text-muted">Loading…</p>}

      {stats && (
        <>
          <div
            className="mb-6 grid grid-cols-2 gap-px sm:grid-cols-3"
            style={{ background: 'var(--color-divider)', border: '2px solid var(--color-divider)' }}
          >
            {kpis.map((kpi) => (
              <div key={kpi.label} style={{ background: 'var(--color-bg)', padding: 'var(--space-4)' }}>
                <h6 className="text-muted" style={{ marginBottom: 'var(--space-2)' }}>
                  {kpi.label}
                </h6>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 34 }}>
                  {kpi.value}
                </div>
              </div>
            ))}
          </div>

          <div className="mb-6 grid gap-6 md:grid-cols-2">
            <div>
              <h5 className="mb-3">Certificate status</h5>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="tag tag-accent">Active</span>
                  <span>{stats.certificatesByStatus.active}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="tag tag-outline">Revoked</span>
                  <span>{stats.certificatesByStatus.revoked}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="tag tag-neutral">Superseded</span>
                  <span>{stats.certificatesByStatus.superseded}</span>
                </div>
              </div>
            </div>

            <div>
              <h5 className="mb-3">Recently issued</h5>
              <table className="table">
                <thead>
                  <tr>
                    <th>Certificate ID</th>
                    <th>Participant</th>
                    <th>Program</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((cert) => (
                    <tr key={cert.id}>
                      <td style={{ fontFamily: 'var(--font-heading)', fontSize: 12 }}>
                        {cert.certificateUid}
                      </td>
                      <td>{cert.participant.fullName}</td>
                      <td>{cert.program.title}</td>
                      <td>
                        <span className={`tag ${STATUS_TAG[cert.status]}`}>{cert.status}</span>
                      </td>
                    </tr>
                  ))}
                  {recent.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-muted">
                        No certificates issued yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="hr" />
          <h6 className="text-muted mb-3">Quick access</h6>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {QUICK_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="card elev-sm">
                <div className="card-title">{link.label}</div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
