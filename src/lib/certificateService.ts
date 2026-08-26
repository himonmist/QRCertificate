import { prisma } from './db';
import { generateCertificateUid, buildCertificateUidPrefix } from './certificateId';
import { computeVerificationHash } from './crypto';
import { generateQrPngBuffer } from './qr';
import { renderCertificatePdf } from './pdf';
import { parseLayoutJson } from './certificateLayout';
import { loadImageBytes } from './storage';
import { deriveProgramCode } from './programCode';
import { toCertificateValues, parseSnapshot, type CertificateSnapshot } from './certificateSnapshot';
import type { Certificate, Participant, ProgramTrainer, Trainer, TrainingProgram, CertificateTemplate } from '@prisma/client';

export interface GenerateOptions {
  programId: string;
  prefix: string;
  programCode?: string;
  participantIds?: string[];
}

export interface GenerateResultItem {
  participantId: string;
  certificateUid: string;
  status: 'generated' | 'skipped_existing';
}

type ProgramWithRelations = TrainingProgram & {
  trainers: (ProgramTrainer & { trainer: Trainer })[];
  template: CertificateTemplate | null;
};

function getAppUrl(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    throw new Error('NEXT_PUBLIC_APP_URL is not configured');
  }
  return appUrl;
}

function buildSnapshot(
  program: ProgramWithRelations,
  participant: Participant,
  certificateUid: string
): CertificateSnapshot {
  const chiefTrainer =
    program.trainers.find((t) => t.role === 'chief_trainer')?.trainer ?? program.trainers[0]?.trainer;

  return {
    participantName: participant.fullName,
    designation: participant.designation ?? undefined,
    programTitle: program.title,
    organizedBy: program.organizedBy,
    issuedBy: program.issuedBy,
    trainerName: chiefTrainer?.name,
    trainingStartDate: program.startDate.toISOString(),
    trainingEndDate: program.endDate.toISOString(),
    location: program.location ?? undefined,
    certificateId: certificateUid,
  };
}

/**
 * Persists the Certificate row with a frozen snapshot of every displayed
 * field. Shared by both first-time generation and reissue so the two paths
 * can never drift (same hash inputs, same snapshot shape). Does NOT render
 * or store the PDF/QR bytes — those are rendered on demand from this
 * snapshot (see renderCertificateAssets) so nothing depends on writing to
 * a local disk, which doesn't persist on serverless hosts like Vercel.
 */
async function buildAndPersistCertificate(
  program: ProgramWithRelations,
  participant: Participant,
  certificateUid: string
): Promise<Certificate> {
  const appUrl = getAppUrl();
  const issuedAt = new Date();
  const qrPayloadUrl = `${appUrl}/verify/${certificateUid}`;
  const verificationHash = computeVerificationHash({
    certificateUid,
    participantId: participant.id,
    programId: program.id,
    issuedAt: issuedAt.toISOString(),
  });
  const snapshot = buildSnapshot(program, participant, certificateUid);

  return prisma.certificate.create({
    data: {
      certificateUid,
      participantId: participant.id,
      programId: program.id,
      templateId: program.templateId,
      qrPayloadUrl,
      qrImageUrl: `/api/certificates/${certificateUid}/qr`,
      pdfUrl: `/api/certificates/${certificateUid}/pdf`,
      verificationHash,
      renderedSnapshotJson: JSON.stringify(snapshot),
      status: 'active',
      issuedAt,
    },
  });
}

/**
 * Generates certificates for eligible participants of a program. Idempotent
 * per participant: anyone who already has an active certificate is skipped
 * rather than issued a second one (use reissueCertificate for corrections).
 */
export async function generateCertificatesForProgram(
  options: GenerateOptions
): Promise<GenerateResultItem[]> {
  getAppUrl();

  const program = await prisma.trainingProgram.findUnique({
    where: { id: options.programId },
    include: { trainers: { include: { trainer: true } }, template: true },
  });
  if (!program) {
    throw new Error('Program not found');
  }

  const participants = await prisma.participant.findMany({
    where: {
      programId: options.programId,
      ...(options.participantIds ? { id: { in: options.participantIds } } : {}),
    },
    include: { certificates: { where: { status: 'active' } } },
  });

  const programCode = options.programCode ?? deriveProgramCode(program.title);
  const uidPrefix = buildCertificateUidPrefix({
    prefix: options.prefix,
    year: program.startDate.getFullYear(),
    programCode,
  });
  // Sequence is scoped to the exact prefix/year/programCode combination
  // (not to this program's row id) so two programs that happen to produce
  // the same human-readable code can never collide on the same uid.
  let sequence = await prisma.certificate.count({ where: { certificateUid: { startsWith: uidPrefix } } });

  const results: GenerateResultItem[] = [];

  for (const participant of participants) {
    if (participant.certificates.length > 0) {
      results.push({
        participantId: participant.id,
        certificateUid: participant.certificates[0]!.certificateUid,
        status: 'skipped_existing',
      });
      continue;
    }

    sequence += 1;
    const certificateUid = generateCertificateUid({
      prefix: options.prefix,
      year: program.startDate.getFullYear(),
      programCode,
      sequence,
    });

    const certificate = await buildAndPersistCertificate(program, participant, certificateUid);
    results.push({ participantId: participant.id, certificateUid: certificate.certificateUid, status: 'generated' });
  }

  return results;
}

/**
 * Supersedes an existing certificate with a freshly generated one for the
 * same participant. The old certificate's QR/verification page keeps
 * resolving forever, now showing "superseded" and linking to the new uid.
 */
export async function reissueCertificate(oldCertificateUid: string): Promise<Certificate> {
  getAppUrl();

  const old = await prisma.certificate.findUnique({
    where: { certificateUid: oldCertificateUid },
    include: {
      participant: true,
      program: { include: { trainers: { include: { trainer: true } }, template: true } },
    },
  });
  if (!old) {
    throw new Error('Certificate not found');
  }
  if (old.status === 'superseded') {
    throw new Error('This certificate has already been superseded');
  }

  const [prefix, , programCode] = old.certificateUid.split('-');
  const resolvedPrefix = prefix || 'CERT';
  const resolvedProgramCode = programCode || deriveProgramCode(old.program.title);
  const uidPrefix = buildCertificateUidPrefix({
    prefix: resolvedPrefix,
    year: old.program.startDate.getFullYear(),
    programCode: resolvedProgramCode,
  });
  const sequence =
    (await prisma.certificate.count({ where: { certificateUid: { startsWith: uidPrefix } } })) + 1;

  const certificateUid = generateCertificateUid({
    prefix: resolvedPrefix,
    year: old.program.startDate.getFullYear(),
    programCode: resolvedProgramCode,
    sequence,
  });

  // Reissue re-snapshots current participant/program data (a correction may
  // be exactly why it's being reissued), unlike a plain re-render of an
  // existing certificate, which must never change its frozen snapshot.
  const newCertificate = await buildAndPersistCertificate(old.program, old.participant, certificateUid);

  await prisma.certificate.update({
    where: { id: old.id },
    data: { status: 'superseded', supersededById: newCertificate.id },
  });

  return newCertificate;
}

export interface RenderedCertificateAssets {
  pdf: Buffer;
  qr: Buffer;
}

/**
 * Renders a previously-issued certificate's PDF + QR on demand from its
 * frozen snapshot, rather than reading a file saved at generation time.
 * Deterministic given the same DB state (aside from the template's
 * background image / trainer's signature image, which are looked up live —
 * see SECURITY.md for that documented tradeoff). Returns null if no such
 * certificate exists.
 */
export async function renderCertificateAssets(certificateUid: string): Promise<RenderedCertificateAssets | null> {
  const certificate = await prisma.certificate.findUnique({
    where: { certificateUid },
    include: {
      program: { include: { trainers: { include: { trainer: true } }, template: true } },
    },
  });
  if (!certificate) return null;

  const snapshot = parseSnapshot(certificate.renderedSnapshotJson);
  const values = toCertificateValues(snapshot);

  const layout = parseLayoutJson(certificate.program.template?.layoutJson);
  const chiefTrainer =
    certificate.program.trainers.find((t) => t.role === 'chief_trainer')?.trainer ??
    certificate.program.trainers[0]?.trainer;

  const [backgroundImageBytes, signatureImageBytes, logoImageBytes, qrBuffer] = await Promise.all([
    certificate.program.template?.backgroundUrl
      ? loadImageBytes(certificate.program.template.backgroundUrl)
      : Promise.resolve(null),
    chiefTrainer?.signatureUrl ? loadImageBytes(chiefTrainer.signatureUrl) : Promise.resolve(null),
    // Loaded live from the program row, same as the signature/background
    // above — a logo is a branding visual, not certified certificate
    // content, so an admin adding one after certificates were already
    // issued should see it appear immediately without needing to reissue.
    certificate.program.logoUrl ? loadImageBytes(certificate.program.logoUrl) : Promise.resolve(null),
    generateQrPngBuffer(certificate.qrPayloadUrl),
  ]);

  const pdfBuffer = await renderCertificatePdf({
    layout,
    backgroundImageBytes,
    signatureImageBytes,
    logoImageBytes,
    values,
    qrPngBuffer: qrBuffer,
  });

  return { pdf: pdfBuffer, qr: qrBuffer };
}
