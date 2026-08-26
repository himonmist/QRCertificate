import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { unauthorized, notFound } from '@/lib/apiHelpers';
import { getAdminContext } from '@/lib/adminContext';
import { parseRowsFromFile, validateRows } from '@/lib/bulkImport';
import { logAudit } from '@/lib/audit';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const admin = getAdminContext(request);
  if (!admin) return unauthorized();

  const program = await prisma.trainingProgram.findUnique({ where: { id: params.id } });
  if (!program) return notFound('Program not found');

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data with a "file" field' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing "file" field (.csv or .xlsx)' }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'File too large. Maximum size is 5MB.' }, { status: 400 });
  }

  let rawRows: Record<string, string>[];
  try {
    rawRows = await parseRowsFromFile(file);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }

  const report = validateRows(rawRows);
  const dryRun = request.nextUrl.searchParams.get('dryRun') === 'true';

  const existingEmails = new Set(
    (
      await prisma.participant.findMany({
        where: { programId: params.id, email: { not: null } },
        select: { email: true },
      })
    ).map((p) => (p.email ?? '').toLowerCase())
  );

  const toInsert = report.validRows.filter((row) => !row.email || !existingEmails.has(row.email));
  const skippedDuplicates = report.validRows.length - toInsert.length;

  if (dryRun) {
    return NextResponse.json({
      totalRows: report.totalRows,
      wouldImport: toInsert.length,
      wouldSkipDuplicates: skippedDuplicates,
      errors: report.errors,
    });
  }

  const created = await prisma.$transaction(
    toInsert.map((row) =>
      prisma.participant.create({
        data: {
          programId: params.id,
          fullName: row.fullName,
          designation: row.designation,
          organization: row.organization,
          email: row.email ?? null,
          phone: row.phone,
        },
      })
    )
  );

  await logAudit({
    adminId: admin.adminId,
    action: 'bulk_import_participants',
    entity: 'program',
    entityId: params.id,
    details: { imported: created.length, skippedDuplicates, errorCount: report.errors.length },
  });

  return NextResponse.json({
    totalRows: report.totalRows,
    imported: created.length,
    skippedDuplicates,
    errors: report.errors,
  });
}
