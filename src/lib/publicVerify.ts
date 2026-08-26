import { createHash } from 'node:crypto';
import { prisma } from './db';
import { isValidCertificateUidFormat } from './certificateId';
import { verifyHash } from './crypto';
import { publicVerifyRateLimiter } from './rateLimit';
import { parseSnapshot } from './certificateSnapshot';

export interface VerifyCertificateResult {
  rateLimited: boolean;
  verified: boolean;
  status: 'active' | 'revoked' | 'superseded' | 'invalid' | 'not_found';
  certificateId?: string;
  participantName?: string;
  designation?: string | null;
  programTitle?: string;
  organizedBy?: string;
  issuedBy?: string;
  trainerName?: string | null;
  issuedAt?: string;
  trainingStartDate?: string;
  trainingEndDate?: string;
  location?: string | null;
  revokedReason?: string | null;
  revokedAt?: string | null;
  supersededByUid?: string | null;
}

/**
 * Core public-verification lookup shared by the /api/public/verify/:uid
 * route and the /verify/[uid] page, so both enforce the same rate limit,
 * hash check, and scan logging exactly once.
 */
export async function verifyCertificate(
  uid: string,
  clientIp: string,
  userAgent: string | null
): Promise<VerifyCertificateResult> {
  const rate = publicVerifyRateLimiter.check(`verify:${clientIp}`);
  if (!rate.allowed) {
    return { rateLimited: true, verified: false, status: 'not_found' };
  }

  if (!isValidCertificateUidFormat(uid)) {
    return { rateLimited: false, verified: false, status: 'not_found' };
  }

  const certificate = await prisma.certificate.findUnique({
    where: { certificateUid: uid },
    include: {
      supersededBy: { select: { certificateUid: true } },
    },
  });

  if (!certificate) {
    return { rateLimited: false, verified: false, status: 'not_found' };
  }

  const hashOk = verifyHash(
    {
      certificateUid: certificate.certificateUid,
      participantId: certificate.participantId,
      programId: certificate.programId,
      issuedAt: certificate.issuedAt.toISOString(),
    },
    certificate.verificationHash
  );

  await prisma.verificationLog.create({
    data: {
      certificateId: certificate.id,
      ipHash: createHash('sha256').update(clientIp).digest('hex'),
      userAgent: userAgent?.slice(0, 300) ?? null,
    },
  });

  if (!hashOk) {
    return { rateLimited: false, verified: false, status: 'invalid' };
  }

  // Display fields come from the snapshot frozen at issuance, never from a
  // live join — a later edit to the participant/program record must not be
  // able to silently rewrite what an already-issued certificate shows.
  const snapshot = parseSnapshot(certificate.renderedSnapshotJson);

  const base = {
    certificateId: certificate.certificateUid,
    participantName: snapshot.participantName,
    designation: snapshot.designation ?? null,
    programTitle: snapshot.programTitle,
    organizedBy: snapshot.organizedBy,
    issuedBy: snapshot.issuedBy,
    trainerName: snapshot.trainerName ?? null,
    issuedAt: certificate.issuedAt.toISOString(),
    trainingStartDate: snapshot.trainingStartDate,
    trainingEndDate: snapshot.trainingEndDate,
    location: snapshot.location ?? null,
  };

  if (certificate.status === 'revoked') {
    return {
      rateLimited: false,
      verified: false,
      status: 'revoked',
      revokedReason: certificate.revokedReason,
      revokedAt: certificate.revokedAt?.toISOString() ?? null,
      ...base,
    };
  }

  if (certificate.status === 'superseded') {
    return {
      rateLimited: false,
      verified: false,
      status: 'superseded',
      supersededByUid: certificate.supersededBy?.certificateUid ?? null,
      ...base,
    };
  }

  return { rateLimited: false, verified: true, status: 'active', ...base };
}
