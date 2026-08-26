'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { DEFAULT_CERTIFICATE_LAYOUT } from '@/lib/certificateLayout';

interface Template {
  id: string;
  name: string;
  backgroundUrl: string | null;
  createdAt: string;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
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
    setName('');
    setBackgroundUrl('');
    load();
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

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">Certificate Templates</h1>
      <p className="mb-6 text-sm text-gray-500">
        Templates define placeholder field positions on the certificate. Programs without a selected
        template use a plain default border layout.
      </p>

      <form onSubmit={handleCreate} className="mb-8 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input placeholder="Template name" value={name} onChange={(e) => setName(e.target.value)} required className="input flex-1" />
          <label className="cursor-pointer rounded-md border border-gray-300 px-3 py-2 text-sm">
            {uploading ? 'Uploading…' : backgroundUrl ? 'Background uploaded ✓' : 'Upload background image'}
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
        </div>
        <textarea
          value={layoutJson}
          onChange={(e) => setLayoutJson(e.target.value)}
          rows={10}
          className="input font-mono text-xs"
        />
        <button type="submit" className="self-start rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          Save Template
        </button>
      </form>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <ul className="space-y-2">
        {templates.map((t) => (
          <li key={t.id} className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
            {t.name}
          </li>
        ))}
        {templates.length === 0 && <p className="text-gray-400">No custom templates yet.</p>}
      </ul>
    </div>
  );
}
