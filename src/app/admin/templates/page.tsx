'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { DEFAULT_CERTIFICATE_LAYOUT } from '@/lib/certificateLayout';

interface Template {
  id: string;
  name: string;
  backgroundUrl: string | null;
  createdAt: string;
}

const PLACEHOLDER_FIELDS = [
  'participant_name',
  'designation',
  'program_title',
  'organized_by',
  'issued_by',
  'trainer_name',
  'trainer_signature',
  'training_date',
  'certificate_id',
  'qr_code',
];

const DEFAULT_TEMPLATE_ID = '__default__';

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState<string>(DEFAULT_TEMPLATE_ID);
  const [creating, setCreating] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [name, setName] = useState('');
  const [backgroundUrl, setBackgroundUrl] = useState('');
  const [layoutJson, setLayoutJson] = useState(() => JSON.stringify(DEFAULT_CERTIFICATE_LAYOUT, null, 2));
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function load() {
    const res = await fetch('/api/templates');
    if (res.ok) setTemplates((await res.json()).templates);
  }

  useEffect(() => {
    load();
  }, []);

  function startCreate() {
    setCreating(true);
    setShowAdvanced(false);
    setName('');
    setBackgroundUrl('');
    setLayoutJson(JSON.stringify(DEFAULT_CERTIFICATE_LAYOUT, null, 2));
    setError(null);
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const res = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, backgroundUrl: backgroundUrl || undefined, layoutJson }),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? 'Failed to create template');
      return;
    }
    const { template } = await res.json();
    setCreating(false);
    await load();
    setSelectedId(template.id);
  }

  async function handleUploadBackground(file: File) {
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.set('file', file);
      const res = await fetch('/api/uploads/logos', { method: 'POST', body: form });
      if (!res.ok) {
        setError((await res.json()).error ?? 'Upload failed');
        return;
      }
      setBackgroundUrl((await res.json()).url);
    } finally {
      setUploading(false);
    }
  }

  const selectedTemplate = templates.find((t) => t.id === selectedId);
  const previewName = creating ? name || 'New template' : selectedTemplate?.name ?? 'Default layout';

  return (
    <div>
      <h1 style={{ marginBottom: 2 }}>Certificate templates</h1>
      <p className="text-muted mb-6" style={{ fontSize: 13 }}>
        Placeholder fields fill in automatically at generation time. Programs without a chosen
        template use the default layout below.
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr]">
        <div>
          <h6 className="text-muted mb-3">Templates</h6>
          <div
            className="mb-4 flex flex-col"
            style={{ gap: 2, background: 'var(--color-divider)', border: '2px solid var(--color-divider)' }}
          >
            <button
              onClick={() => {
                setSelectedId(DEFAULT_TEMPLATE_ID);
                setCreating(false);
              }}
              style={{
                textAlign: 'left',
                border: 0,
                cursor: 'pointer',
                background: !creating && selectedId === DEFAULT_TEMPLATE_ID ? 'var(--color-accent-100)' : 'var(--color-surface)',
                color: 'var(--color-text)',
                padding: 'var(--space-3)',
                font: 'inherit',
              }}
            >
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 14 }}>Default layout</div>
              <div className="text-muted" style={{ fontSize: 11 }}>Built-in · A4 landscape</div>
            </button>
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setSelectedId(t.id);
                  setCreating(false);
                }}
                style={{
                  textAlign: 'left',
                  border: 0,
                  cursor: 'pointer',
                  background: !creating && selectedId === t.id ? 'var(--color-accent-100)' : 'var(--color-surface)',
                  color: 'var(--color-text)',
                  padding: 'var(--space-3)',
                  font: 'inherit',
                }}
              >
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                <div className="text-muted" style={{ fontSize: 11 }}>
                  {t.backgroundUrl ? 'Custom background' : 'No background image'}
                </div>
              </button>
            ))}
          </div>
          <button className="btn btn-secondary btn-block" style={{ justifyContent: 'center' }} onClick={startCreate}>
            + New template
          </button>

          <div className="hr" />
          <h6 className="text-muted mb-2">Placeholder fields</h6>
          <div className="flex flex-wrap gap-1">
            {PLACEHOLDER_FIELDS.map((field) => (
              <span key={field} className="tag tag-outline" style={{ fontFamily: 'var(--font-heading)' }}>
                {field}
              </span>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h6 className="text-muted" style={{ margin: 0 }}>
              Preview — {previewName}
            </h6>
            {creating && (
              <div className="flex gap-2">
                <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
                  {uploading ? 'Uploading…' : backgroundUrl ? 'Background uploaded ✓' : 'Upload background'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadBackground(file);
                    }}
                  />
                </label>
                <button form="template-create-form" type="submit" className="btn btn-primary">
                  Save template
                </button>
              </div>
            )}
          </div>

          {creating && (
            <form id="template-create-form" onSubmit={handleCreate} className="card elev-sm mb-4">
              <div className="field">
                <label>Template name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} required className="input" />
              </div>
              {error && <p style={{ color: 'var(--color-accent-700)', fontSize: 13 }}>{error}</p>}
              <button
                type="button"
                className="btn btn-ghost"
                style={{ alignSelf: 'flex-start', paddingInline: 0 }}
                onClick={() => setShowAdvanced((v) => !v)}
              >
                {showAdvanced ? 'Hide advanced layout JSON' : 'Advanced: edit layout JSON'}
              </button>
              {showAdvanced && (
                <textarea
                  value={layoutJson}
                  onChange={(e) => setLayoutJson(e.target.value)}
                  rows={10}
                  className="input"
                  style={{ fontFamily: 'monospace', fontSize: 12 }}
                />
              )}
              <div className="flex justify-end">
                <button type="button" className="btn btn-secondary" onClick={() => setCreating(false)}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div
            style={{
              background: '#ffffff',
              color: '#1a1a1a',
              border: '3px solid var(--color-text)',
              position: 'relative',
              aspectRatio: '1.414 / 1',
              maxWidth: 820,
              padding: 'var(--space-6)',
              display: 'flex',
              flexDirection: 'column',
              backgroundImage: creating
                ? backgroundUrl
                  ? `url(${backgroundUrl})`
                  : undefined
                : selectedTemplate?.backgroundUrl
                  ? `url(${selectedTemplate.backgroundUrl})`
                  : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            <span style={{ position: 'absolute', top: 10, left: 10, width: 14, height: 14, background: 'var(--color-accent)' }} />
            <span style={{ position: 'absolute', top: 10, right: 10, width: 14, height: 14, background: 'var(--color-accent)' }} />
            <span style={{ position: 'absolute', bottom: 10, left: 10, width: 14, height: 14, background: 'var(--color-accent)' }} />
            <span style={{ position: 'absolute', bottom: 10, right: 10, width: 14, height: 14, background: 'var(--color-accent)' }} />

            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, letterSpacing: '0.14em', color: 'var(--color-accent)', textTransform: 'uppercase' }}>
                {'{{organized_by}}'}
              </div>
              <h2 style={{ margin: 'var(--space-2) 0 0', letterSpacing: '-0.01em', color: '#1a1a1a' }}>
                Certificate of Completion
              </h2>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)', textAlign: 'center' }}>
              <div className="text-muted" style={{ fontSize: 12 }}>This certifies that</div>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 30 }}>{'{{participant_name}}'}</div>
              <div className="text-muted" style={{ fontSize: 13 }}>{'{{designation}}'}</div>
              <div style={{ fontSize: 14, marginTop: 'var(--space-2)', maxWidth: '60%' }}>
                has successfully completed <strong>{'{{program_title}}'}</strong>, organized by{' '}
                {'{{organized_by}}'}, issued by {'{{issued_by}}'}
              </div>
              <div className="text-muted" style={{ fontSize: 12 }}>{'{{training_date}}'}</div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1px solid var(--color-divider)', paddingTop: 'var(--space-3)' }}>
              <div style={{ fontSize: 10, fontFamily: 'var(--font-heading)', letterSpacing: '0.04em' }}>{'{{certificate_id}}'}</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ height: 24, fontFamily: 'cursive', fontSize: 16 }}>{'{{trainer_signature}}'}</div>
                <div style={{ borderTop: '1px solid var(--color-text)', paddingTop: 4, fontSize: 11 }}>{'{{trainer_name}}'}</div>
              </div>
              <div
                style={{
                  width: 52,
                  height: 52,
                  background: 'repeating-linear-gradient(45deg, #1a1a1a 0 4px, transparent 4px 8px)',
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
