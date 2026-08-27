import { describe, expect, it } from 'vitest';
import { validateRows, parseRowsFromFile } from '@/lib/bulkImport';

describe('validateRows', () => {
  it('accepts well-formed rows using the required template columns', () => {
    const report = validateRows([
      { 'Full Name': 'John Smith', Designation: 'Dr.', Organization: 'Acme', Email: 'john@acme.com', Phone: '' },
      { 'Full Name': 'Jane Roe', Designation: '', Organization: '', Email: '', Phone: '555-1234' },
    ]);
    expect(report.errors).toHaveLength(0);
    expect(report.validRows).toHaveLength(2);
    expect(report.validRows[0]).toMatchObject({ fullName: 'John Smith', email: 'john@acme.com' });
  });

  it('reports a row-level error for a missing full name, keyed to the spreadsheet row number', () => {
    const report = validateRows([
      { 'Full Name': 'John Smith', Designation: '', Organization: '', Email: '', Phone: '' },
      { 'Full Name': '', Designation: '', Organization: '', Email: '', Phone: '' },
    ]);
    expect(report.errors).toEqual([expect.objectContaining({ row: 3 })]);
    expect(report.validRows).toHaveLength(1);
  });

  it('reports a row-level error for a malformed email', () => {
    const report = validateRows([
      { 'Full Name': 'John Smith', Designation: '', Organization: '', Email: 'not-an-email', Phone: '' },
    ]);
    expect(report.errors).toHaveLength(1);
    expect(report.validRows).toHaveLength(0);
  });

  it('flags duplicate emails within the same upload', () => {
    const report = validateRows([
      { 'Full Name': 'John Smith', Designation: '', Organization: '', Email: 'dup@acme.com', Phone: '' },
      { 'Full Name': 'John Smith Two', Designation: '', Organization: '', Email: 'dup@acme.com', Phone: '' },
    ]);
    expect(report.validRows).toHaveLength(1);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]?.message).toMatch(/Duplicate email/);
  });

  it('handles an empty sheet', () => {
    const report = validateRows([]);
    expect(report.totalRows).toBe(0);
    expect(report.validRows).toHaveLength(0);
    expect(report.errors).toHaveLength(0);
  });
});

describe('parseRowsFromFile', () => {
  it('strips a leading UTF-8 byte-order-mark so the header matches "Full Name" exactly', async () => {
    // Reproduces a real upload: Excel/Google Sheets "CSV UTF-8" exports
    // commonly prefix the file with EF BB BF, which decodes to a literal
    // U+FEFF character. Left on the first header, every row in the file
    // fails validation because no column is ever named exactly "Full Name".
    const bom = '﻿';
    const csv = `${bom}Full Name,Designation,Organization,Email,Phone\nJohn Smith,Dr.,Acme,john@acme.com,555-1234\n`;
    const file = new File([csv], 'participants.csv', { type: 'text/csv' });

    const rows = await parseRowsFromFile(file);
    expect(Object.keys(rows[0]!)).toContain('Full Name');
    expect(Object.keys(rows[0]!)).not.toContain(`${bom}Full Name`);

    const report = validateRows(rows);
    expect(report.errors).toHaveLength(0);
    expect(report.validRows).toEqual([
      { fullName: 'John Smith', designation: 'Dr.', organization: 'Acme', email: 'john@acme.com', phone: '555-1234' },
    ]);
  });

  it('trims stray whitespace around header names', async () => {
    const csv = ' Full Name ,Designation,Organization,Email,Phone\nJane Roe,,,,\n';
    const file = new File([csv], 'participants.csv', { type: 'text/csv' });

    const rows = await parseRowsFromFile(file);
    expect(Object.keys(rows[0]!)).toContain('Full Name');

    const report = validateRows(rows);
    expect(report.errors).toHaveLength(0);
    expect(report.validRows[0]?.fullName).toBe('Jane Roe');
  });
});
