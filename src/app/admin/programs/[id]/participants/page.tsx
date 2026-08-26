'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';

interface Participant {
  id: string;
  fullName: string;
  designation: string | null;
  email: string | null;
  status: 'registered' | 'certificate_generated';
  certificates: { certificateUid: string; status: string }[];
}

interface Trainer {
  id: string;
  name: string;
  status: string;
}

interface ProgramDetail {
  id: string;
  title: string;
  trainers: { role: string; trainer: Trainer }[];
}

export default function ProgramParticipantsPage() {
  const params = useParams<{ id: string }>();
  const programId = params.id;

  const [program, setProgram] = useState<ProgramDetail | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [singleForm, setSingleForm] = useState({ fullName: '', designation: '', email: '' });
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkPreview, setBulkPreview] = useState<{ wouldImport: number; wouldSkipDuplicates: number; errors: { row: number; message: string }[] } | null>(null);
  const [selectedTrainerId, setSelectedTrainerId] = useState('');
  const [trainerRole, setTrainerRole] = useState<'chief_trainer' | 'trainer'>('trainer');
  const [prefix, setPrefix] = useState('MNC');

  async function loadAll() {
    const [programRes, participantsRes, trainersRes] = await Promise.all([
      fetch(`/api/programs/${programId}`),
      fetch(`/api/programs/${programId}/participants`),
      fetch('/api/trainers'),
    ]);
    if (programRes.ok) setProgram((await programRes.json()).program);
    if (participantsRes.ok) setParticipants((await participantsRes.json()).participants);
    if (trainersRes.ok) setTrainers((await trainersRes.json()).trainers);
  }

  useEffect(() => {
    if (programId) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId]);

  async function handleAddParticipant(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const res = await fetch(`/api/programs/${programId}/participants`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(singleForm),
    });
    if (!res.ok) {
      setError((await res.json()).error);
      return;
    }
    setSingleForm({ fullName: '', designation: '', email: '' });
    loadAll();
  }

  async function handleBulkPreview() {
    if (!bulkFile) return;
    const form = new FormData();
    form.set('file', bulkFile);
    const res = await fetch(`/api/programs/${programId}/participants/bulk?dryRun=true`, { method: 'POST', body: form });
    if (res.ok) setBulkPreview(await res.json());
  }

  async function handleBulkConfirm() {
    if (!bulkFile) return;
    const form = new FormData();
    form.set('file', bulkFile);
    const res = await fetch(`/api/programs/${programId}/participants/bulk`, { method: 'POST', body: form });
    if (res.ok) {
      const json = await res.json();
      setNotice(`Imported ${json.imported}, skipped ${json.skippedDuplicates} duplicates, ${json.errors.length} errors.`);
      setBulkFile(null);
      setBulkPreview(null);
      loadAll();
    }
  }

  async function handleAssignTrainer(event: FormEvent) {
    event.preventDefault();
    if (!selectedTrainerId) return;
    const res = await fetch(`/api/programs/${programId}/trainers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ trainerId: selectedTrainerId, role: trainerRole }),
    });
    if (!res.ok) {
      setError((await res.json()).error);
      return;
    }
    loadAll();
  }

  async function handleGenerate() {
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/programs/${programId}/certificates/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prefix }),
    });
    if (!res.ok) {
      setError((await res.json()).error);
      return;
    }
    const json = await res.json();
    setNotice(`Generated ${json.generated} certificate(s), skipped ${json.skipped} already-issued.`);
    loadAll();
  }

  if (!program) return <p>Loading…</p>;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{program.title}</h1>
      <p className="mb-6 text-sm text-gray-500">Manage trainers, participants, and certificate issuance for this program.</p>

      <section className="mb-8 rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 font-semibold">Assigned Trainers</h2>
        <ul className="mb-3 flex flex-wrap gap-2 text-sm">
          {program.trainers.map((pt) => (
            <li key={pt.trainer.id} className="rounded-full bg-gray-100 px-3 py-1">
              {pt.trainer.name} <span className="text-xs text-gray-500">({pt.role})</span>
            </li>
          ))}
          {program.trainers.length === 0 && <li className="text-gray-400">No trainers assigned yet.</li>}
        </ul>
        <form onSubmit={handleAssignTrainer} className="flex flex-wrap items-end gap-3">
          <select value={selectedTrainerId} onChange={(e) => setSelectedTrainerId(e.target.value)} className="input">
            <option value="">Select trainer…</option>
            {trainers.map((t) => (
              <option key={t.id} value={t.id} disabled={t.status !== 'active'}>
                {t.name} {t.status !== 'active' ? '(inactive)' : ''}
              </option>
            ))}
          </select>
          <select value={trainerRole} onChange={(e) => setTrainerRole(e.target.value as 'chief_trainer' | 'trainer')} className="input">
            <option value="trainer">Trainer</option>
            <option value="chief_trainer">Chief Trainer</option>
          </select>
          <button type="submit" className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Assign
          </button>
        </form>
      </section>

      <section className="mb-8 rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 font-semibold">Add Participant</h2>
        <form onSubmit={handleAddParticipant} className="flex flex-wrap items-end gap-3">
          <input
            placeholder="Full name"
            value={singleForm.fullName}
            onChange={(e) => setSingleForm({ ...singleForm, fullName: e.target.value })}
            required
            className="input"
          />
          <input
            placeholder="Designation"
            value={singleForm.designation}
            onChange={(e) => setSingleForm({ ...singleForm, designation: e.target.value })}
            className="input"
          />
          <input
            placeholder="Email"
            type="email"
            value={singleForm.email}
            onChange={(e) => setSingleForm({ ...singleForm, email: e.target.value })}
            className="input"
          />
          <button type="submit" className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Add
          </button>
        </form>

        <div className="mt-4 border-t border-gray-100 pt-4">
          <h3 className="mb-2 text-sm font-semibold">Bulk Upload (.csv or .xlsx)</h3>
          <p className="mb-2 text-xs text-gray-500">
            Columns: Full Name, Designation, Organization, Email, Phone
          </p>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => {
              setBulkFile(e.target.files?.[0] ?? null);
              setBulkPreview(null);
            }}
            className="mb-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={handleBulkPreview}
              disabled={!bulkFile}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              Preview
            </button>
            <button
              onClick={handleBulkConfirm}
              disabled={!bulkFile}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              Confirm Import
            </button>
          </div>
          {bulkPreview && (
            <p className="mt-2 text-sm text-gray-600">
              Would import {bulkPreview.wouldImport}, skip {bulkPreview.wouldSkipDuplicates} duplicates,{' '}
              {bulkPreview.errors.length} row error(s).
            </p>
          )}
        </div>
      </section>

      <section className="mb-8 rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 font-semibold">Generate Certificates</h2>
        <div className="flex items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">Certificate ID Prefix</span>
            <input value={prefix} onChange={(e) => setPrefix(e.target.value)} className="input" />
          </label>
          <button onClick={handleGenerate} className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Bulk Generate
          </button>
        </div>
      </section>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {notice && <p className="mb-4 text-sm text-green-700">{notice}</p>}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Certificate</th>
            </tr>
          </thead>
          <tbody>
            {participants.map((p) => (
              <tr key={p.id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium">{p.fullName}</td>
                <td className="px-4 py-3 text-gray-600">{p.email ?? '—'}</td>
                <td className="px-4 py-3">{p.status}</td>
                <td className="px-4 py-3 font-mono text-xs">{p.certificates[0]?.certificateUid ?? '—'}</td>
              </tr>
            ))}
            {participants.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                  No participants yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
