'use client';

import { useEffect, useState } from 'react';

interface Stats {
  totalPrograms: number;
  totalTrainers: number;
  totalParticipants: number;
  totalCertificates: number;
  certificatesByStatus: { active: number; revoked: number; superseded: number };
  totalScans: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch('/api/dashboard/stats')
      .then((res) => res.json())
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  const cards = stats
    ? [
        { label: 'Training Programs', value: stats.totalPrograms },
        { label: 'Trainers', value: stats.totalTrainers },
        { label: 'Participants', value: stats.totalParticipants },
        { label: 'Certificates Issued', value: stats.totalCertificates },
        { label: 'Active Certificates', value: stats.certificatesByStatus.active },
        { label: 'Verification Scans', value: stats.totalScans },
      ]
    : [];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Dashboard</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">{card.label}</p>
            <p className="mt-1 text-3xl font-bold text-brand-700">{card.value}</p>
          </div>
        ))}
        {!stats && <p className="col-span-full text-sm text-gray-500">Loading…</p>}
      </div>
    </div>
  );
}
