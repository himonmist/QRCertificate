'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';

interface Program {
  id: string;
  title: string;
  category: string;
  organizedBy: string;
  startDate: string;
  endDate: string;
  location: string | null;
  _count: { participants: number; certificates: number };
}

const CATEGORIES = ['workshop', 'course', 'seminar', 'certification'];

const EMPTY_FORM = {
  title: '',
  category: 'workshop',
  organizedBy: '',
  issuedBy: '',
  startDate: '',
  endDate: '',
  location: '',
};

export default function ProgramsPage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  async function loadPrograms() {
    const res = await fetch('/api/programs');
    if (res.ok) setPrograms((await res.json()).programs);
  }

  useEffect(() => {
    loadPrograms();
  }, []);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const res = await fetch('/api/programs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? JSON.stringify(body.details ?? 'Failed to create program'));
      return;
    }
    setForm(EMPTY_FORM);
    setShowForm(false);
    loadPrograms();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 style={{ margin: 0 }}>Training programs</h1>
        <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancel' : '+ New program'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card elev-sm mb-6">
          <div className="field">
            <label>Program title</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required className="input" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="field">
              <label>Category</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Organized by</label>
              <input value={form.organizedBy} onChange={(e) => setForm({ ...form, organizedBy: e.target.value })} required className="input" />
            </div>
            <div className="field">
              <label>Issued by</label>
              <input value={form.issuedBy} onChange={(e) => setForm({ ...form, issuedBy: e.target.value })} required className="input" />
            </div>
            <div className="field">
              <label>Start date</label>
              <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required className="input" />
            </div>
            <div className="field">
              <label>End date</label>
              <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required className="input" />
            </div>
            <div className="field">
              <label>Location</label>
              <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="input" />
            </div>
          </div>
          {error && <p style={{ color: 'var(--color-accent-700)', fontSize: 13 }}>{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Create program
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {programs.map((program) => (
          <div key={program.id} className="card elev-sm">
            <div className="card-kicker">{program.category}</div>
            <div className="card-title">{program.title}</div>
            <p className="card-body">
              Organized by {program.organizedBy} · {program.startDate.slice(0, 10)} →{' '}
              {program.endDate.slice(0, 10)}
              {program.location ? ` · ${program.location}` : ''}
            </p>
            <div className="card-meta">
              {program._count.participants} participants · {program._count.certificates} certificates
            </div>
            <Link href={`/admin/programs/${program.id}/participants`} className="btn btn-ghost" style={{ alignSelf: 'flex-start' }}>
              Manage participants & certificates →
            </Link>
          </div>
        ))}
        {programs.length === 0 && <p className="text-muted">No programs yet.</p>}
      </div>
    </div>
  );
}
