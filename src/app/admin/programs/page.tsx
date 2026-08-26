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
  _count: { participants: number; certificates: number };
}

const CATEGORIES = ['workshop', 'course', 'seminar', 'certification'];

export default function ProgramsPage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    category: 'workshop',
    organizedBy: '',
    issuedBy: '',
    startDate: '',
    endDate: '',
    location: '',
  });

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
    setForm({ title: '', category: 'workshop', organizedBy: '', issuedBy: '', startDate: '', endDate: '', location: '' });
    loadPrograms();
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Training Programs</h1>

      <form onSubmit={handleCreate} className="mb-8 grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:grid-cols-2">
        <Field label="Title">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required className="input" />
        </Field>
        <Field label="Category">
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input">
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Organized By">
          <input value={form.organizedBy} onChange={(e) => setForm({ ...form, organizedBy: e.target.value })} required className="input" />
        </Field>
        <Field label="Issued By">
          <input value={form.issuedBy} onChange={(e) => setForm({ ...form, issuedBy: e.target.value })} required className="input" />
        </Field>
        <Field label="Start Date">
          <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required className="input" />
        </Field>
        <Field label="End Date">
          <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required className="input" />
        </Field>
        <Field label="Location">
          <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="input" />
        </Field>
        <div className="flex items-end">
          <button type="submit" className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Create Program
          </button>
        </div>
      </form>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {programs.map((program) => (
          <div key={program.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <p className="font-semibold">{program.title}</p>
            <p className="text-xs uppercase text-gray-500">{program.category}</p>
            <p className="mt-1 text-sm text-gray-600">Organized by {program.organizedBy}</p>
            <p className="text-sm text-gray-500">
              {program.startDate.slice(0, 10)} → {program.endDate.slice(0, 10)}
            </p>
            <p className="mt-2 text-sm text-gray-500">
              {program._count.participants} participants · {program._count.certificates} certificates
            </p>
            <Link
              href={`/admin/programs/${program.id}/participants`}
              className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline"
            >
              Manage participants & certificates →
            </Link>
          </div>
        ))}
        {programs.length === 0 && <p className="text-gray-400">No programs yet.</p>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}
