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
      <StatusShell tone="warn" title="Too many requests" subtitle="Please try again in a minute.">
        <p className="text-sm text-gray-600">
          This verification endpoint is rate-limited to protect against automated scraping.
        </p>
      </StatusShell>
    );
  }

  if (result.status === 'not_found') {
    return (
      <StatusShell tone="error" title="Not Found" subtitle={`Certificate ID: ${params.uid}`}>
        <p className="text-sm text-gray-600">
          No certificate matches this ID. It may have been mistyped, or it does not exist.
        </p>
      </StatusShell>
    );
  }

  if (result.status === 'invalid') {
    return (
      <StatusShell tone="error" title="Invalid Certificate" subtitle={`Certificate ID: ${params.uid}`}>
        <p className="text-sm text-gray-600">
          This certificate ID exists but failed an integrity check. It may have been tampered with.
        </p>
      </StatusShell>
    );
  }

  const details = (
    <dl className="grid grid-cols-1 gap-3 text-left">
      <Detail label="Participant" value={`${result.participantName}${result.designation ? `, ${result.designation}` : ''}`} />
      <Detail label="Program" value={result.programTitle} />
      <Detail label="Organized By" value={result.organizedBy} />
      <Detail label="Issued By" value={result.issuedBy} />
      {result.trainerName && <Detail label="Trainer" value={result.trainerName} />}
      <Detail
        label="Training Date"
        value={
          result.trainingStartDate === result.trainingEndDate
            ? formatDate(result.trainingStartDate)
            : `${formatDate(result.trainingStartDate)} – ${formatDate(result.trainingEndDate)}`
        }
      />
      {result.location && <Detail label="Location" value={result.location} />}
      <Detail label="Issue Date" value={formatDate(result.issuedAt)} />
      <Detail label="Certificate ID" value={result.certificateId ?? params.uid} mono />
    </dl>
  );

  if (result.status === 'revoked') {
    return (
      <StatusShell tone="warn" title="Revoked" subtitle={`Certificate ID: ${result.certificateId}`}>
        {result.revokedReason && (
          <p className="mb-4 text-sm text-gray-600">Reason: {result.revokedReason}</p>
        )}
        {details}
      </StatusShell>
    );
  }

  if (result.status === 'superseded') {
    return (
      <StatusShell tone="warn" title="Superseded" subtitle={`Certificate ID: ${result.certificateId}`}>
        {result.supersededByUid && (
          <p className="mb-4 text-sm text-gray-600">
            A newer version of this certificate was issued.{' '}
            <Link href={`/verify/${result.supersededByUid}`} className="font-medium text-brand-700 underline">
              View current certificate ({result.supersededByUid})
            </Link>
          </p>
        )}
        {details}
      </StatusShell>
    );
  }

  return (
    <StatusShell tone="success" title="Valid / Verified" subtitle={`Certificate ID: ${result.certificateId}`}>
      {details}
      <a
        href={`/api/public/verify/${result.certificateId}/pdf`}
        className="mt-6 inline-block rounded-md bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-700"
      >
        Download PDF
      </a>
    </StatusShell>
  );
}

function Detail({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className={`text-sm text-gray-900 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}

const TONE_STYLES: Record<string, { badge: string; icon: string }> = {
  success: { badge: 'bg-green-100 text-green-800', icon: '✅' },
  warn: { badge: 'bg-amber-100 text-amber-800', icon: '⚠️' },
  error: { badge: 'bg-red-100 text-red-800', icon: '❌' },
};

function StatusShell({
  tone,
  title,
  subtitle,
  children,
}: {
  tone: 'success' | 'warn' | 'error';
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  const style = TONE_STYLES[tone] ?? TONE_STYLES.error!;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className={`mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${style!.badge}`}>
          <span>{style!.icon}</span>
          <span>{title}</span>
        </div>
        {subtitle && <p className="mb-4 font-mono text-xs text-gray-500">{subtitle}</p>}
        {children}
      </div>
      <p className="mt-6 text-center text-xs text-gray-400">
        <Link href="/verify" className="underline">
          Verify another certificate
        </Link>
      </p>
    </main>
  );
}
