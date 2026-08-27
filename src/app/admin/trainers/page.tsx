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

interface EditForm {
  name: string;
  email: string;
  designation: string;
  organization: string;
}

function toEditForm(trainer: Trainer): EditForm {
  return {
    name: trainer.name,
    email: trainer.email,
    designation: trainer.designation ?? '',
    organization: trainer.organization ?? '',
  };
}

export default function TrainersPage() {
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [designation, setDesignation] = useState('');
  const [organization, setOrganization] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [signatureUploading, setSignatureUploading] = useState<string | null>(null);
  const [signatureErrors, setSignatureErrors] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ name: '', email: '', designation: '', organization: '' });
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  async function loadTrainers() {
    const res = await fetch('/api/trainers');
    if (res.ok) setTrainers((await res.json()).trainers);
  }

  useEffect(() => {
    loadTrainers();
  }, []);

  function resetForm() {
    setName('');
    setEmail('');
    setDesignation('');
    setOrganization('');
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const res = await fetch('/api/trainers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name,
        email,
        designation: designation || undefined,
        organization: organization || undefined,
      }),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? 'Failed to create trainer');
      return;
    }
    resetForm();
    setShowForm(false);
    loadTrainers();
  }

  function startEdit(trainer: Trainer) {
    setEditingId(trainer.id);
    setEditForm(toEditForm(trainer));
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function saveEdit(trainerId: string) {
    setSavingEdit(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/trainers/${trainerId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name,
          email: editForm.email,
          designation: editForm.designation || undefined,
          organization: editForm.organization || undefined,
        }),
      });
      if (!res.ok) {
        setEditError((await res.json()).error ?? 'Failed to save changes');
        return;
      }
      setEditingId(null);
      await loadTrainers();
    } finally {
      setSavingEdit(false);
    }
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
    setSignatureUploading(trainerId);
    setSignatureErrors((prev) => ({ ...prev, [trainerId]: '' }));
    try {
      const form = new FormData();
      form.set('signature', file);
      const res = await fetch(`/api/trainers/${trainerId}/signature`, { method: 'POST', body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSignatureErrors((prev) => ({ ...prev, [trainerId]: body.error ?? 'Upload failed' }));
        return;
      }
      await loadTrainers();
    } catch {
      setSignatureErrors((prev) => ({ ...prev, [trainerId]: 'Upload failed — check your connection and try again' }));
    } finally {
      setSignatureUploading(null);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 style={{ margin: 0 }}>Trainers</h1>
        <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancel' : '+ Add trainer'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card elev-sm mb-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="field">
              <label>Full name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required className="input" />
            </div>
            <div className="field">
              <label>Designation</label>
              <input value={designation} onChange={(e) => setDesignation(e.target.value)} className="input" />
            </div>
            <div className="field">
              <label>Organization</label>
              <input value={organization} onChange={(e) => setOrganization(e.target.value)} className="input" />
            </div>
            <div className="field">
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="input" />
            </div>
          </div>
          {error && (
            <p style={{ color: 'var(--color-accent-700)', fontSize: 13 }}>{error}</p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Add trainer
            </button>
          </div>
        </form>
      )}

      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Designation</th>
            <th>Organization</th>
            <th>Status</th>
            <th>Signature</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {trainers.map((trainer) =>
            editingId === trainer.id ? (
              <tr key={trainer.id}>
                <td>
                  <input
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="input"
                    style={{ minWidth: 140 }}
                  />
                </td>
                <td>
                  <input
                    value={editForm.designation}
                    onChange={(e) => setEditForm({ ...editForm, designation: e.target.value })}
                    className="input"
                  />
                </td>
                <td>
                  <input
                    value={editForm.organization}
                    onChange={(e) => setEditForm({ ...editForm, organization: e.target.value })}
                    className="input"
                  />
                </td>
                <td colSpan={2}>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="input"
                  />
                  {editError && (
                    <p style={{ color: 'var(--color-accent-700)', fontSize: 11, margin: '4px 0 0' }}>{editError}</p>
                  )}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button onClick={cancelEdit} className="btn btn-ghost" disabled={savingEdit}>
                    Cancel
                  </button>
                  <button onClick={() => saveEdit(trainer.id)} className="btn btn-primary" disabled={savingEdit}>
                    {savingEdit ? 'Saving…' : 'Save'}
                  </button>
                </td>
              </tr>
            ) : (
              <tr key={trainer.id}>
                <td style={{ fontWeight: 600 }}>{trainer.name}</td>
                <td>{trainer.designation ?? '—'}</td>
                <td>{trainer.organization ?? '—'}</td>
                <td>
                  <span className={`tag ${trainer.status === 'active' ? 'tag-accent' : 'tag-neutral'}`}>
                    {trainer.status}
                  </span>
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    {trainer.signatureUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={trainer.signatureUrl} alt={`${trainer.name}'s signature`} style={{ height: 28 }} />
                    )}
                    <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
                      {signatureUploading === trainer.id ? 'Uploading…' : trainer.signatureUrl ? 'Replace' : 'Upload'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        disabled={signatureUploading === trainer.id}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) uploadSignature(trainer.id, file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                  {signatureErrors[trainer.id] && (
                    <p style={{ color: 'var(--color-accent-700)', fontSize: 11, margin: '2px 0 0' }}>
                      {signatureErrors[trainer.id]}
                    </p>
                  )}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button onClick={() => startEdit(trainer)} className="btn btn-ghost">
                    Edit
                  </button>
                  <button onClick={() => toggleStatus(trainer)} className="btn btn-ghost">
                    {trainer.status === 'active' ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            )
          )}
          {trainers.length === 0 && (
            <tr>
              <td colSpan={6} className="text-muted">
                No trainers yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
