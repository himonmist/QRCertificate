import { headers } from 'next/headers';
import Link from 'next/link';
import { verifyCertificate } from '@/lib/publicVerify';

export const dynamic = 'force-dynamic';

function formatDate(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function getClientIpFromHeaders(headerList: ReturnType<typeof headers>): string {
  const forwarded = headerList.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headerList.get('x-real-ip') ?? 'unknown';
}

export default async function VerifyCertificatePage({ params }: { params: { uid: string } }) {
  const headerList = headers();
  const ip = getClientIpFromHeaders(headerList);
  const userAgent = headerList.get('user-agent');

  const result = await verifyCertificate(params.uid, ip, userAgent);

  if (result.rateLimited) {
    return (
      <StatusShell badgeTag="tag-outline" badgeLabel="⚠ Too many requests" certId={params.uid}>
        <p style={{ fontSize: 13, margin: 0 }}>
          This verification endpoint is rate-limited to protect against automated scraping. Please
          try again in a minute.
        </p>
      </StatusShell>
    );
  }

  if (result.status === 'not_found') {
    return (
      <StatusShell badgeTag="tag-outline" badgeLabel="✕ Not found" certId={params.uid}>
        <p style={{ fontSize: 13, margin: 0 }}>
          No certificate matches this ID. It may have been mistyped, or it does not exist.
        </p>
      </StatusShell>
    );
  }

  if (result.status === 'invalid') {
    return (
      <StatusShell badgeTag="tag-outline" badgeLabel="✕ Invalid certificate" certId={params.uid}>
        <p style={{ fontSize: 13, margin: 0 }}>
          This certificate ID exists but failed an integrity check. It may have been tampered with.
        </p>
      </StatusShell>
    );
  }

  const details = [
    { label: 'Participant', value: `${result.participantName}${result.designation ? `, ${result.designation}` : ''}` },
    { label: 'Program', value: result.programTitle },
    { label: 'Organized by', value: result.organizedBy },
    { label: 'Issued by', value: result.issuedBy },
    result.trainerName ? { label: 'Trainer', value: result.trainerName } : null,
    {
      label: 'Training date',
      value:
        result.trainingStartDate === result.trainingEndDate
          ? formatDate(result.trainingStartDate)
          : `${formatDate(result.trainingStartDate)} – ${formatDate(result.trainingEndDate)}`,
    },
    result.location ? { label: 'Location', value: result.location } : null,
    { label: 'Issue date', value: formatDate(result.issuedAt) },
  ].filter((d): d is { label: string; value: string } => Boolean(d && d.value));

  if (result.status === 'revoked') {
    return (
      <StatusShell badgeTag="tag-outline" badgeLabel="⚠ Revoked" certId={result.certificateId ?? params.uid}>
        {result.revokedReason && <p style={{ fontSize: 13, marginBottom: 'var(--space-4)' }}>Reason: {result.revokedReason}</p>}
        <Details items={details} />
      </StatusShell>
    );
  }

  if (result.status === 'superseded') {
    return (
      <StatusShell badgeTag="tag-neutral" badgeLabel="Superseded" certId={result.certificateId ?? params.uid}>
        {result.supersededByUid && (
          <p style={{ fontSize: 13, marginBottom: 'var(--space-4)' }}>
            A newer version of this certificate was issued.{' '}
            <Link href={`/verify/${result.supersededByUid}`}>View current certificate ({result.supersededByUid})</Link>
          </p>
        )}
        <Details items={details} />
      </StatusShell>
    );
  }

  return (
    <StatusShell badgeTag="tag-accent" badgeLabel="✓ Valid / Verified" certId={result.certificateId ?? params.uid}>
      <Details items={details} />
      <a href={`/api/public/verify/${result.certificateId}/pdf`} className="btn btn-primary btn-block" style={{ justifyContent: 'center', marginTop: 'var(--space-4)' }}>
        Download PDF
      </a>
    </StatusShell>
  );
}

function Details({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <div key={item.label}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'color-mix(in srgb, var(--color-text) 55%, transparent)' }}>
            {item.label}
          </div>
          <div style={{ fontSize: 14 }}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function StatusShell({
  badgeTag,
  badgeLabel,
  certId,
  children,
}: {
  badgeTag: string;
  badgeLabel: string;
  certId: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col" style={{ background: 'var(--color-bg)' }}>
      <header className="flex items-center gap-2 px-4 py-4" style={{ borderBottom: '2px solid var(--color-divider)' }}>
        <div style={{ width: 16, height: 16, background: 'var(--color-accent)' }} />
        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 14 }}>
          QRCertificate — Certificate Verification
        </span>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-6">
        <div className="w-full" style={{ maxWidth: 420 }}>
          <div className="card elev-md" style={{ padding: 'var(--space-6)' }}>
            <span
              className={`tag ${badgeTag}`}
              style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 13, padding: '5px 14px', alignSelf: 'flex-start' }}
            >
              {badgeLabel}
            </span>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 11, opacity: 0.6, margin: 'var(--space-1) 0 var(--space-4)' }}>
              Certificate ID: {certId}
            </div>
            {children}
          </div>
          <p className="text-muted" style={{ textAlign: 'center', fontSize: 12, marginTop: 'var(--space-4)' }}>
            <Link href="/verify">Verify another certificate</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
