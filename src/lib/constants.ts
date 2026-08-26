export const ADMIN_ROLES = ['super_admin', 'admin'] as const;
export const TRAINER_STATUSES = ['active', 'inactive'] as const;
export const PROGRAM_CATEGORIES = ['workshop', 'course', 'seminar', 'certification'] as const;
export const PROGRAM_TRAINER_ROLES = ['chief_trainer', 'trainer'] as const;
export const CERTIFICATE_STATUSES = ['active', 'revoked', 'superseded'] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];
export type TrainerStatus = (typeof TRAINER_STATUSES)[number];
export type ProgramCategory = (typeof PROGRAM_CATEGORIES)[number];
export type ProgramTrainerRole = (typeof PROGRAM_TRAINER_ROLES)[number];
export type CertificateStatus = (typeof CERTIFICATE_STATUSES)[number];
