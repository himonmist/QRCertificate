import type { CertificateValues } from './pdf';

/**
 * Everything about a certificate that a human reads, frozen at the moment
 * it was issued (or reissued). Stored as JSON on Certificate.renderedSnapshotJson
 * and used for every future render — never re-derived from the live
 * Participant/TrainingProgram rows, which an admin may edit afterward.
 */
export interface CertificateSnapshot {
  participantName: string;
  designation?: string;
  programTitle: string;
  organizedBy: string;
  issuedBy: string;
  trainerName?: string;
  trainingStartDate: string; // ISO
  trainingEndDate: string; // ISO
  location?: string;
  certificateId: string;
  logoUrl?: string;
}

function formatDateRange(startIso: string, endIso: string): string {
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' };
  const start = new Date(startIso).toLocaleDateString('en-US', options);
  const end = new Date(endIso).toLocaleDateString('en-US', options);
  return start === end ? start : `${start} – ${end}`;
}

/** Derives the flat, PDF-ready field set from a frozen snapshot. */
export function toCertificateValues(snapshot: CertificateSnapshot): CertificateValues {
  return {
    participant_name: snapshot.participantName,
    designation: snapshot.designation,
    program_title: snapshot.programTitle,
    organized_by: snapshot.organizedBy,
    issued_by: snapshot.issuedBy,
    trainer_name: snapshot.trainerName,
    training_date: formatDateRange(snapshot.trainingStartDate, snapshot.trainingEndDate),
    location: snapshot.location,
    certificate_id: snapshot.certificateId,
  };
}

export function parseSnapshot(json: string): CertificateSnapshot {
  return JSON.parse(json) as CertificateSnapshot;
}
