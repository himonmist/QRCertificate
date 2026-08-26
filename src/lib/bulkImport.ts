import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { bulkParticipantRowSchema } from './validation';

export interface ParsedParticipantRow {
  fullName: string;
  designation?: string;
  organization?: string;
  email?: string;
  phone?: string;
}

export interface RowError {
  row: number; // 1-indexed, matching spreadsheet row (header = row 1)
  message: string;
}

export interface BulkImportReport {
  totalRows: number;
  validRows: ParsedParticipantRow[];
  errors: RowError[];
}

/** Parses a bulk-upload file (CSV or XLSX) into raw header/value row objects. */
export async function parseRowsFromFile(file: File): Promise<Record<string, string>[]> {
  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (name.endsWith('.csv')) {
    const text = buffer.toString('utf-8');
    const result = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
    });
    return result.data;
  }

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return [];
    const sheet = workbook.Sheets[firstSheetName];
    if (!sheet) return [];
    return XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' });
  }

  throw new Error('Unsupported file type. Upload a .csv or .xlsx file.');
}

/** Validates raw rows against the required bulk template columns. */
export function validateRows(rows: Record<string, string>[]): BulkImportReport {
  const errors: RowError[] = [];
  const validRows: ParsedParticipantRow[] = [];
  const seenEmailsInBatch = new Set<string>();

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // account for header row
    const parsed = bulkParticipantRowSchema.safeParse(row);
    if (!parsed.success) {
      errors.push({ row: rowNumber, message: parsed.error.issues.map((i) => i.message).join('; ') });
      return;
    }

    const email = parsed.data.Email.trim().toLowerCase();
    if (email && seenEmailsInBatch.has(email)) {
      errors.push({ row: rowNumber, message: `Duplicate email within upload: ${email}` });
      return;
    }
    if (email) seenEmailsInBatch.add(email);

    validRows.push({
      fullName: parsed.data['Full Name'],
      designation: parsed.data.Designation || undefined,
      organization: parsed.data.Organization || undefined,
      email: email || undefined,
      phone: parsed.data.Phone || undefined,
    });
  });

  return { totalRows: rows.length, validRows, errors };
}
