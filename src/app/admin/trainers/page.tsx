'use client';

import { useEffect, useState, type FormEvent } from 'react';

interface Trainer {
  id: string;
  name: string;
  email: string;
  designation: string | null;
  organization: string | null;
  status: 'active' | 'inactive';
  signatureUrl: string | null;
}

export default function TrainersPage() {
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [designation, setDesignation] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function loadTrainers() {
    const res = await fetch('/api/trainers');
    if (res.ok) setTrainers((await res.json()).trainers);
  }

  useEffect(() => {
    loadTrainers();
  }, []);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const res = await fetch('/api/trainers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, email, designation: designation || undefined }),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? 'Failed to create trainer');
      return;
    }
    setName('');
    setEmail('');
    setDesignation('');
    loadTrainers();
  }

  async function toggleStatus(trainer: Trainer) {
    const nextStatus = trainer.status === 'active' ? 'inactive' : 'active';
    await fetch(`/api/trainers/${trainer.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });
    loadTrainers();
  }

  async function uploadSignature(trainerId: string, file: File) {
    const form = new FormData();
    form.set('signature', file);
    const res = await fetch(`/api/trainers/${trainerId}/signature`, { method: 'POST', body: form });
    if (res.ok) loadTrainers();
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Trainers</h1>

      <form onSubmit={handleCreate} className="mb-8 flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} required className="input" />
        </Field>
        <Field label="Email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="input" />
        </Field>
        <Field label="Designation">
          <input value={designation} onChange={(e) => setDesignation(e.target.value)} className="input" />
        </Field>
        <button type="submit" className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          Add Trainer
        </button>
      </form>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Signature</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {trainers.map((trainer) => (
              <tr key={trainer.id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium">{trainer.name}</td>
                <td className="px-4 py-3 text-gray-600">{trainer.email}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      trainer.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {trainer.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {trainer.signatureUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={trainer.signatureUrl} alt="signature" className="h-8" />
                  ) : (
                    <label className="cursor-pointer text-xs text-brand-700 underline">
                      Upload
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) uploadSignature(trainer.id, file);
                        }}
                      />
                    </label>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => toggleStatus(trainer)} className="text-xs font-medium text-brand-700 hover:underline">
                    {trainer.status === 'active' ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
            {trainers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                  No trainers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
