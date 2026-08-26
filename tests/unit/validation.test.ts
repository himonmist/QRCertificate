import { describe, expect, it } from 'vitest';
import {
  trainerInputSchema,
  programInputSchema,
  participantInputSchema,
  bulkParticipantRowSchema,
  loginInputSchema,
  templateInputSchema,
} from '@/lib/validation';

describe('trainerInputSchema', () => {
  it('accepts a valid trainer', () => {
    const result = trainerInputSchema.safeParse({
      name: 'Dr. Jane Doe',
      email: 'jane@example.com',
      designation: 'Professor',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid email', () => {
    const result = trainerInputSchema.safeParse({ name: 'Jane', email: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty name', () => {
    const result = trainerInputSchema.safeParse({ name: '', email: 'jane@example.com' });
    expect(result.success).toBe(false);
  });
});

describe('programInputSchema', () => {
  it('accepts a valid program', () => {
    const result = programInputSchema.safeParse({
      title: 'SmartDoc AI: The Clinical Transformation Blueprint',
      category: 'workshop',
      organizedBy: 'MN Corporation',
      issuedBy: 'MN Corporation',
      startDate: '2026-03-01',
      endDate: '2026-03-02',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an end date before the start date', () => {
    const result = programInputSchema.safeParse({
      title: 'Workshop',
      category: 'workshop',
      organizedBy: 'MN Corporation',
      issuedBy: 'MN Corporation',
      startDate: '2026-03-05',
      endDate: '2026-03-01',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid category', () => {
    const result = programInputSchema.safeParse({
      title: 'Workshop',
      category: 'not-a-category',
      organizedBy: 'MN Corporation',
      issuedBy: 'MN Corporation',
      startDate: '2026-03-01',
      endDate: '2026-03-02',
    });
    expect(result.success).toBe(false);
  });
});

describe('participantInputSchema', () => {
  it('accepts a participant without an email', () => {
    const result = participantInputSchema.safeParse({ fullName: 'John Smith' });
    expect(result.success).toBe(true);
  });

  it('rejects a blank full name', () => {
    const result = participantInputSchema.safeParse({ fullName: '   ' });
    expect(result.success).toBe(false);
  });
});

describe('bulkParticipantRowSchema', () => {
  it('maps the required CSV template columns', () => {
    const result = bulkParticipantRowSchema.safeParse({
      'Full Name': 'John Smith',
      Designation: 'Asst. Prof. Dr.',
      Organization: 'Some University',
      Email: 'john@example.com',
      Phone: '',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a row missing the full name', () => {
    const result = bulkParticipantRowSchema.safeParse({
      'Full Name': '',
      Designation: '',
      Organization: '',
      Email: '',
      Phone: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('templateInputSchema', () => {
  it('accepts a backgroundUrl produced by the image upload endpoint', () => {
    const result = templateInputSchema.safeParse({
      name: 'Green Border',
      backgroundUrl: '/uploads/logos/abc-123.png',
      layoutJson: '{}',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a template with no backgroundUrl', () => {
    expect(templateInputSchema.safeParse({ name: 'Plain', layoutJson: '{}' }).success).toBe(true);
  });

  it('rejects a path-traversal payload for backgroundUrl', () => {
    const result = templateInputSchema.safeParse({
      name: 'Malicious',
      backgroundUrl: '../../../../etc/passwd',
      layoutJson: '{}',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an arbitrary absolute filesystem path for backgroundUrl', () => {
    const result = templateInputSchema.safeParse({
      name: 'Malicious',
      backgroundUrl: '/etc/passwd',
      layoutJson: '{}',
    });
    expect(result.success).toBe(false);
  });
});

describe('loginInputSchema', () => {
  it('accepts valid credentials shape', () => {
    expect(loginInputSchema.safeParse({ email: 'a@b.com', password: 'x'.repeat(8) }).success).toBe(
      true
    );
  });

  it('rejects a short password', () => {
    expect(loginInputSchema.safeParse({ email: 'a@b.com', password: '123' }).success).toBe(false);
  });
});
