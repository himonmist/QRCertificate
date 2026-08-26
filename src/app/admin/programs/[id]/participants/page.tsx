'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Participant {
  id: string;
  fullName: string;
  designation: string | null;
  organization: string | null;
  email: string | null;
  status: 'registered' | 'certificate_generated';
  certificates: { certificateUid: string; status: string }[];
}

interface Trainer {
  id: string;
  name: string;
  status: string;
}

interface Template {
  id: string;
  name: string;
}

interface ProgramDetail {
  id: string;
  title: string;
  organizedBy: string;
  startDate: string;
  endDate: string;
  location: string | null;
  templateId: string | null;
  trainers: { role: string; trainer: Trainer }[];
}

export default function ProgramParticipantsPage() {
  const params = useParams<{ id: string }>();
  const programId = params.id;

  const [program, setProgram] = useState<ProgramDetail | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showBulkForm, setShowBulkForm] = useState(false);

  const [singleForm, setSingleForm] = useState({ fullName: '', designation: '', email: '' });
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkPreview, setBulkPreview] = useState<{ wouldImport: number; wouldSkipDuplicates: number; errors: { row: number; message: string }[] } | null>(null);
  const [selectedTrainerId, setSelectedTrainerId] = useState('');
  const [trainerRole, setTrainerRole] = useState<'chief_trainer' | 'trainer'>('trainer');
  const [prefix, setPrefix] = useState('MNC');

  async function loadAll() {
    const [programRes, participantsRes, trainersRes, templatesRes] = await Promise.all([
      fetch(`/api/programs/${programId}`),
      fetch(`/api/programs/${programId}/participants`),
      fetch('/api/trainers'),
      fetch('/api/templates'),
    ]);
    if (programRes.ok) setProgram((await programRes.json()).program);
    if (participantsRes.ok) setParticipants((await participantsRes.json()).participants);
    if (trainersRes.ok) setTrainers((await trainersRes.json()).trainers);
    if (templatesRes.ok) setTemplates((await templatesRes.json()).templates);
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
    setShowAddForm(false);
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
      setShowBulkForm(false);
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

  async function handleTemplateChange(templateId: string) {
    await fetch(`/api/programs/${programId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ templateId }),
    });
    loadAll();
  }

  async function handleGenerate() {
    setError(null);
    setNotice(null);
    setGenerating(true);
    try {
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
    } finally {
      setGenerating(false);
    }
  }

  if (!program) return <p className="text-muted">Loading…</p>;

  const pendingCount = participants.filter((p) => p.certificates.length === 0).length;
  const hasAnyIssued = participants.some((p) => p.certificates.length > 0);
  const generateLabel = generating
    ? 'Generating…'
    : hasAnyIssued && pendingCount === 0
      ? 'Regenerate'
      : `Generate ${pendingCount} certificate${pendingCount === 1 ? '' : 's'}`;

  return (
    <div>
      <Link href="/admin/programs" className="btn btn-ghost" style={{ paddingInline: 0, marginBottom: 'var(--space-2)' }}>
        ← All programs
      </Link>
      <h1 style={{ marginBottom: 2 }}>{program.title}</h1>
      <p className="text-muted mb-6" style={{ fontSize: 13 }}>
        Organized by {program.organizedBy} · {program.startDate.slice(0, 10)} → {program.endDate.slice(0, 10)}
        {program.location ? ` · ${program.location}` : ''}
      </p>

      {error && <p className="mb-4" style={{ color: 'var(--color-accent-700)', fontSize: 13 }}>{error}</p>}
      {notice && <p className="mb-4" style={{ color: 'var(--color-accent-800)', fontSize: 13 }}>{notice}</p>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h5 style={{ margin: 0 }}>Participants</h5>
            <div className="flex gap-2">
              <button className="btn btn-secondary" onClick={() => setShowAddForm((v) => !v)}>
                {showAddForm ? 'Cancel' : '+ Add participant'}
              </button>
              <button className="btn btn-secondary" onClick={() => setShowBulkForm((v) => !v)}>
                {showBulkForm ? 'Cancel' : 'Bulk upload'}
              </button>
            </div>
          </div>

          {showAddForm && (
            <form onSubmit={handleAddParticipant} className="card elev-sm mb-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="field">
                  <label>Full name</label>
                  <input
                    value={singleForm.fullName}
                    onChange={(e) => setSingleForm({ ...singleForm, fullName: e.target.value })}
                    required
                    className="input"
                  />
                </div>
                <div className="field">
                  <label>Designation</label>
                  <input
                    value={singleForm.designation}
                    onChange={(e) => setSingleForm({ ...singleForm, designation: e.target.value })}
                    className="input"
                  />
                </div>
                <div className="field">
                  <label>Email</label>
                  <input
                    type="email"
                    value={singleForm.email}
                    onChange={(e) => setSingleForm({ ...singleForm, email: e.target.value })}
                    className="input"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Add participant
                </button>
              </div>
            </form>
          )}

          {showBulkForm && (
            <div className="card elev-sm mb-4">
              <p className="text-muted" style={{ fontSize: 12 }}>
                Columns: Full Name, Designation, Organization, Email, Phone
              </p>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => {
                  setBulkFile(e.target.files?.[0] ?? null);
                  setBulkPreview(null);
                }}
              />
              <div className="flex gap-2">
                <button onClick={handleBulkPreview} disabled={!bulkFile} className="btn btn-secondary">
                  Preview
                </button>
                <button onClick={handleBulkConfirm} disabled={!bulkFile} className="btn btn-primary">
                  Confirm import
                </button>
              </div>
              {bulkPreview && (
                <p className="text-muted" style={{ fontSize: 13 }}>
                  Would import {bulkPreview.wouldImport}, skip {bulkPreview.wouldSkipDuplicates} duplicates,{' '}
                  {bulkPreview.errors.length} row error(s).
                </p>
              )}
            </div>
          )}

          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Designation</th>
                <th>Organization</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {participants.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600 }}>{p.fullName}</td>
                  <td>{p.designation ?? '—'}</td>
                  <td>{p.organization ?? '—'}</td>
                  <td>
                    <span className={`tag ${p.certificates.length > 0 ? 'tag-accent' : 'tag-neutral'}`}>
                      {p.status === 'certificate_generated' ? 'Certificate issued' : 'Registered'}
                    </span>
                  </td>
                </tr>
              ))}
              {participants.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-muted">
                    No participants yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-4">
          <div className="card elev-sm">
            <div className="card-title">Trainers</div>
            <div className="flex flex-wrap gap-2">
              {program.trainers.map((pt) => (
                <span key={pt.trainer.id} className="tag tag-neutral">
                  {pt.trainer.name} ({pt.role === 'chief_trainer' ? 'Chief' : 'Trainer'})
                </span>
              ))}
              {program.trainers.length === 0 && <span className="text-muted" style={{ fontSize: 12 }}>None assigned yet.</span>}
            </div>
            <form onSubmit={handleAssignTrainer} className="flex flex-col gap-2">
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
              <button type="submit" className="btn btn-secondary btn-block" style={{ justifyContent: 'center' }}>
                Assign
              </button>
            </form>
          </div>

          <div className="card elev-sm">
            <div className="card-title">Template</div>
            <select
              value={program.templateId ?? ''}
              onChange={(e) => handleTemplateChange(e.target.value)}
              className="input"
            >
              <option value="">Default layout</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <Link href="/admin/templates" className="btn btn-ghost" style={{ paddingInline: 0 }}>
              Change template →
            </Link>
          </div>

          <div className="card elev-md">
            <div className="card-title">Generate certificates</div>
            <p className="card-body">
              {pendingCount} participant{pendingCount === 1 ? '' : 's'} without a certificate.
            </p>
            <div className="field">
              <label>Certificate ID prefix</label>
              <input value={prefix} onChange={(e) => setPrefix(e.target.value)} className="input" />
            </div>
            <button
              onClick={handleGenerate}
              disabled={generating || participants.length === 0}
              className="btn btn-primary btn-block"
              style={{ justifyContent: 'center' }}
            >
              {generateLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
