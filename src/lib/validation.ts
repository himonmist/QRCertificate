import { z } from 'zod';

export const trainerInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  designation: z.string().trim().max(200).optional(),
  organization: z.string().trim().max(200).optional(),
  email: z.string().trim().email('Invalid email address').max(320),
  phone: z.string().trim().max(50).optional(),
  bio: z.string().trim().max(5000).optional(),
});

export const programInputSchemaBase = z.object({
  title: z.string().trim().min(1).max(300),
  category: z.enum(['workshop', 'course', 'seminar', 'certification']),
  organizedBy: z.string().trim().min(1).max(300),
  supportedBy: z.string().trim().max(300).optional(),
  issuedBy: z.string().trim().min(1).max(300),
  description: z.string().trim().max(5000).optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  location: z.string().trim().max(300).optional(),
  duration: z.string().trim().max(100).optional(),
  templateId: z.string().uuid().optional(),
});

export const programInputSchema = programInputSchemaBase.refine(
  (data) => data.endDate >= data.startDate,
  { message: 'endDate must be on or after startDate', path: ['endDate'] }
);

// Used for partial updates (PUT), where .refine()'s ZodEffects wrapper
// (from programInputSchema) doesn't support .partial().
export const programUpdateInputSchema = programInputSchemaBase.partial().refine(
  (data) => !data.startDate || !data.endDate || data.endDate >= data.startDate,
  { message: 'endDate must be on or after startDate', path: ['endDate'] }
);

export const programTrainerAssignSchema = z.object({
  trainerId: z.string().uuid(),
  role: z.enum(['chief_trainer', 'trainer']).default('trainer'),
});

export const participantInputSchema = z.object({
  fullName: z.string().trim().min(1, 'Full name is required').max(200),
  designation: z.string().trim().max(200).optional(),
  organization: z.string().trim().max(200).optional(),
  email: z.string().trim().email().max(320).optional().or(z.literal('')),
  phone: z.string().trim().max(50).optional(),
});

export const bulkParticipantRowSchema = z
  .object({
    'Full Name': z.string().trim().min(1, 'Full Name is required'),
    Designation: z.string().trim().optional().default(''),
    Organization: z.string().trim().optional().default(''),
    Email: z.string().trim().optional().default(''),
    Phone: z.string().trim().optional().default(''),
  })
  .refine((row) => row.Email === '' || z.string().email().safeParse(row.Email).success, {
    message: 'Email must be valid if provided',
    path: ['Email'],
  });

export const loginInputSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(200),
});

// Must match the exact shape produced by saveUploadedImage() (src/lib/storage.ts):
// /uploads/<category>/<uuid>.<ext>. This is deliberately not a general URL —
// it is later joined onto a filesystem path (see resolvePublicPath in
// certificateService.ts), so accepting arbitrary strings here would open a
// path-traversal hole (e.g. "../../../../etc/something").
const UPLOADED_IMAGE_PATH_PATTERN =
  /^\/uploads\/(signatures|logos|participants)\/[a-zA-Z0-9-]+\.(png|jpe?g|webp)$/i;

export const templateInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  backgroundUrl: z
    .string()
    .trim()
    .max(500)
    .regex(UPLOADED_IMAGE_PATH_PATTERN, 'backgroundUrl must be a path returned by an image upload endpoint')
    .optional(),
  layoutJson: z.string().min(2),
});

export const revokeInputSchema = z.object({
  reason: z.string().trim().min(1, 'A revoke reason is required').max(1000),
});

export const certificateGenerateInputSchema = z.object({
  prefix: z.string().trim().min(1).max(20),
  programCode: z.string().trim().min(1).max(20).optional(),
  participantIds: z.array(z.string().uuid()).optional(),
});
