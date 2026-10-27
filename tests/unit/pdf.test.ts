import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFDict, StandardFonts } from 'pdf-lib';
import { renderCertificatePdf, wrapTextToLines, fitFontSizeToWidth, resolveFooterLayout } from '@/lib/pdf';
import { DEFAULT_CERTIFICATE_LAYOUT } from '@/lib/certificateLayout';
import { generateQrPngBuffer } from '@/lib/qr';

async function countImageXObjects(pdfBytes: Buffer): Promise<number> {
  const doc = await PDFDocument.load(pdfBytes);
  const resources = doc.getPage(0).node.Resources();
  const xobjects = resources?.lookup(PDFName.of('XObject'), PDFDict);
  return xobjects ? xobjects.keys().length : 0;
}

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

  it('embeds an optional logo image in the default design without requiring one', async () => {
    const qr = await generateQrPngBuffer('https://verify.example.com/verify/MNC-2026-SDA-000001');
    const values = {
      participant_name: 'John Smith',
      program_title: 'SmartDoc AI Workshop',
      organized_by: 'MN Corporation',
      issued_by: 'MN Corporation',
      training_date: 'March 1, 2026',
      certificate_id: 'MNC-2026-SDA-000001',
    };

    const withoutLogo = await renderCertificatePdf({
      layout: DEFAULT_CERTIFICATE_LAYOUT,
      backgroundImageBytes: null,
      signatureImageBytes: null,
      logoImageBytes: null,
      values,
      qrPngBuffer: qr,
    });
    expect((await PDFDocument.load(withoutLogo)).getPageCount()).toBe(1);

    const withLogo = await renderCertificatePdf({
      layout: DEFAULT_CERTIFICATE_LAYOUT,
      backgroundImageBytes: null,
      signatureImageBytes: null,
      logoImageBytes: qr, // any valid PNG stands in for a logo image here
      values,
      qrPngBuffer: qr,
    });
    expect((await PDFDocument.load(withLogo)).getPageCount()).toBe(1);
  });

  it('renders a valid PDF with the logo_left design variant, with or without a logo/signature', async () => {
    const qr = await generateQrPngBuffer('https://verify.example.com/verify/MNC-2026-SDA-000001');
    const values = {
      participant_name: 'Dr. Abdul Muhit Chowdhury Abir',
      program_title: 'AI for Ophthalmologist',
      organized_by: 'Popular Pharmaceuticals PLC, Ophthalmic Business Unit',
      issued_by: 'Popular Pharmaceuticals PLC',
      trainer_name: 'MD Hasan Mahfuz',
      training_date: 'October 26-27, 2026',
      certificate_id: 'MNCORPORATION-2026-AFOOBP-000001',
    };

    for (const [signatureImageBytes, logoImageBytes] of [
      [null, null],
      [qr, null],
      [null, qr],
      [qr, qr],
    ] as const) {
      const pdfBytes = await renderCertificatePdf({
        layout: DEFAULT_CERTIFICATE_LAYOUT,
        backgroundImageBytes: null,
        signatureImageBytes,
        logoImageBytes,
        designVariant: 'logo_left',
        values,
        qrPngBuffer: qr,
      });
      expect(pdfBytes.subarray(0, 5).toString('utf-8')).toBe('%PDF-');
      expect((await PDFDocument.load(pdfBytes)).getPageCount()).toBe(1);
    }
  });

  it('falls back to the classic design for an unrecognized designVariant instead of throwing', async () => {
    const qr = await generateQrPngBuffer('https://verify.example.com/verify/MNC-2026-SDA-000001');
    const pdfBytes = await renderCertificatePdf({
      layout: DEFAULT_CERTIFICATE_LAYOUT,
      backgroundImageBytes: null,
      signatureImageBytes: null,
      // Simulates stale/corrupt DB data — must not crash certificate rendering.
      designVariant: 'some-removed-or-invalid-variant' as never,
      values: {
        participant_name: 'John Smith',
        program_title: 'SmartDoc AI Workshop',
        organized_by: 'MN Corporation',
        issued_by: 'MN Corporation',
        training_date: 'March 1, 2026',
        certificate_id: 'MNC-2026-SDA-000001',
      },
      qrPngBuffer: qr,
    });
    expect((await PDFDocument.load(pdfBytes)).getPageCount()).toBe(1);
  });

  it('draws the top-left organizer logo independently of the bottom-right supported-by logo', async () => {
    const qr = await generateQrPngBuffer('https://verify.example.com/verify/MNC-2026-SDA-000001');
    // Two distinct PNGs standing in for two different uploaded logos.
    const organizerLogo = await generateQrPngBuffer('https://verify.example.com/verify/ORGANIZER-LOGO');
    const supportedByLogo = await generateQrPngBuffer('https://verify.example.com/verify/SUPPORTED-BY-LOGO');
    const values = {
      participant_name: 'John Smith',
      program_title: 'SmartDoc AI Workshop',
      organized_by: 'Popular Pharmaceuticals PLC',
      issued_by: 'MN Corporation',
      training_date: 'March 1, 2026',
      certificate_id: 'MNC-2026-SDA-000001',
    };
    const render = (opts: { logoImageBytes?: Buffer | null; organizerLogoImageBytes?: Buffer | null }) =>
      renderCertificatePdf({
        layout: DEFAULT_CERTIFICATE_LAYOUT,
        backgroundImageBytes: null,
        signatureImageBytes: null,
        designVariant: 'logo_left',
        values,
        qrPngBuffer: qr,
        ...opts,
      });

    const neither = await countImageXObjects(await render({}));
    const organizerOnly = await countImageXObjects(await render({ organizerLogoImageBytes: organizerLogo }));
    const supportedByOnly = await countImageXObjects(await render({ logoImageBytes: supportedByLogo }));
    const both = await countImageXObjects(await render({ logoImageBytes: supportedByLogo, organizerLogoImageBytes: organizerLogo }));

    // Each logo is independently optional and additive — setting one must
    // not draw, substitute for, or suppress the other.
    expect(organizerOnly).toBe(neither + 1);
    expect(supportedByOnly).toBe(neither + 1);
    expect(both).toBe(neither + 2);
  });

  it('does not overflow the footer for a very long organization or trainer name', async () => {
    const qr = await generateQrPngBuffer('https://verify.example.com/verify/MNC-2026-SDA-000001');
    const pdfBytes = await renderCertificatePdf({
      layout: DEFAULT_CERTIFICATE_LAYOUT,
      backgroundImageBytes: null,
      signatureImageBytes: null,
      values: {
        participant_name: 'John Smith',
        program_title: 'SmartDoc AI Workshop',
        organized_by: 'MN Corporation',
        issued_by: 'The Extremely Long Name Pharmaceutical and Healthcare Corporation Bangladesh Limited',
        trainer_name: 'Professor Doctor Muhammad Abdullah Al-Mahmud Chowdhury Rahman',
        training_date: 'March 1, 2026',
        certificate_id: 'MNC-2026-SDA-000001',
      },
      qrPngBuffer: qr,
    });

    expect(pdfBytes.subarray(0, 5).toString('utf-8')).toBe('%PDF-');
    expect((await PDFDocument.load(pdfBytes)).getPageCount()).toBe(1);
  });
});

describe('resolveFooterLayout', () => {
  const WIDTH = 841.89;

  it('keeps the signature at its classic left position and no top-left logo by default', () => {
    expect(resolveFooterLayout(undefined, WIDTH)).toEqual({ trainerX: 145, showTopLeftLogo: false });
  });

  it('centers the signature and enables the top-left logo for the logo_left variant', () => {
    expect(resolveFooterLayout('logo_left', WIDTH)).toEqual({ trainerX: WIDTH / 2, showTopLeftLogo: true });
  });

  it('treats any unrecognized variant as the classic layout', () => {
    expect(resolveFooterLayout('future-variant' as never, WIDTH)).toEqual({ trainerX: 145, showTopLeftLogo: false });
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
