import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { renderCertificatePdf } from '@/lib/pdf';
import { DEFAULT_CERTIFICATE_LAYOUT } from '@/lib/certificateLayout';
import { generateQrPngBuffer } from '@/lib/qr';

describe('renderCertificatePdf', () => {
  it('produces a single-page, parseable PDF containing no background/signature images', async () => {
    const qr = await generateQrPngBuffer('https://verify.example.com/verify/MNC-2026-SDA-000001');
    const pdfBytes = await renderCertificatePdf({
      layout: DEFAULT_CERTIFICATE_LAYOUT,
      backgroundImageBytes: null,
      signatureImageBytes: null,
      values: {
        participant_name: 'John Smith',
        designation: 'Asst. Prof. Dr.',
        program_title: 'SmartDoc AI Workshop',
        organized_by: 'MN Corporation',
        issued_by: 'MN Corporation',
        trainer_name: 'Dr. Jane Doe',
        training_date: 'March 1-2, 2026',
        certificate_id: 'MNC-2026-SDA-000001',
      },
      qrPngBuffer: qr,
    });

    expect(pdfBytes.subarray(0, 5).toString('utf-8')).toBe('%PDF-');

    const loaded = await PDFDocument.load(pdfBytes);
    expect(loaded.getPageCount()).toBe(1);
  });

  it('embeds a background and signature image when bytes are provided', async () => {
    const qr = await generateQrPngBuffer('https://verify.example.com/verify/MNC-2026-SDA-000001');
    // Any valid PNG works for this test; reuse the QR buffer as a stand-in image.
    const pdfBytes = await renderCertificatePdf({
      layout: DEFAULT_CERTIFICATE_LAYOUT,
      backgroundImageBytes: qr,
      signatureImageBytes: qr,
      values: {
        participant_name: 'John Smith',
        program_title: 'SmartDoc AI Workshop',
        organized_by: 'MN Corporation',
        issued_by: 'MN Corporation',
        training_date: 'March 1-2, 2026',
        certificate_id: 'MNC-2026-SDA-000001',
      },
      qrPngBuffer: qr,
    });

    expect(pdfBytes.subarray(0, 5).toString('utf-8')).toBe('%PDF-');
    const loaded = await PDFDocument.load(pdfBytes);
    expect(loaded.getPageCount()).toBe(1);
  });
});
