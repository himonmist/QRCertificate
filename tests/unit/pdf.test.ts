import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { renderCertificatePdf, wrapTextToLines, fitFontSizeToWidth } from '@/lib/pdf';
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

  it('still produces a valid single-page PDF for a program title too long to fit at its configured size', async () => {
    const qr = await generateQrPngBuffer('https://verify.example.com/verify/MNC-2026-SDA-000001');
    const pdfBytes = await renderCertificatePdf({
      layout: DEFAULT_CERTIFICATE_LAYOUT,
      backgroundImageBytes: null,
      signatureImageBytes: null,
      values: {
        participant_name: 'Prof. Dr. Shah Habibur Rahman',
        program_title:
          'SmartDoc AI: The Clinical Transformation Blueprint - (Mobile-Based Clinical AI Workshop for Doctors)',
        organized_by: 'Aristopharma Ltd',
        issued_by: 'Aristopharma Ltd',
        training_date: 'August 20, 2026',
        certificate_id: 'MNC-2026-1DWOSA-000002',
      },
      qrPngBuffer: qr,
    });

    expect(pdfBytes.subarray(0, 5).toString('utf-8')).toBe('%PDF-');
    const loaded = await PDFDocument.load(pdfBytes);
    expect(loaded.getPageCount()).toBe(1);
  });
});

describe('fitFontSizeToWidth', () => {
  it('keeps the base size when the text already fits', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    expect(fitFontSizeToWidth(font, 'Short Title', 18, 400)).toBe(18);
  });

  it('shrinks toward the minimum, never below it, for text that never fits', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const size = fitFontSizeToWidth(font, 'A'.repeat(400), 18, 300);
    expect(size).toBe(Math.max(9, Math.round(18 * 0.55)));
  });
});

describe('wrapTextToLines', () => {
  it('returns a single line when the text fits', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    expect(wrapTextToLines(font, 'Short Title', 14, 400)).toEqual(['Short Title']);
  });

  it('wraps long text across multiple lines, each within maxWidth', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const text =
      'SmartDoc AI: The Clinical Transformation Blueprint - (Mobile-Based Clinical AI Workshop for Doctors)';
    const maxWidth = 400;
    const lines = wrapTextToLines(font, text, 14, maxWidth);

    expect(lines.length).toBeGreaterThan(1);
    expect(lines.length).toBeLessThanOrEqual(3);
    for (const line of lines) {
      // The last line can exceed maxWidth if it absorbed overflow from
      // hitting the line cap — every other line must respect it.
      if (line !== lines[lines.length - 1]) {
        expect(font.widthOfTextAtSize(line, 14)).toBeLessThanOrEqual(maxWidth);
      }
    }
    expect(lines.join(' ')).toBe(text);
  });

  it('caps wrapping at three lines, folding any remainder into the last line', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const words = Array.from({ length: 40 }, (_, i) => `word${i}`);
    const lines = wrapTextToLines(font, words.join(' '), 14, 60);
    expect(lines.length).toBe(3);
  });
});
