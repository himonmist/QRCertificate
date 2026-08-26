import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import type { CertificateFieldLayout, CertificateLayout } from './certificateLayout';

export interface CertificateValues {
  participant_name: string;
  designation?: string;
  program_title: string;
  organized_by: string;
  issued_by: string;
  trainer_name?: string;
  training_date: string;
  location?: string;
  certificate_id: string;
}

export interface RenderCertificateInput {
  layout: CertificateLayout;
  backgroundImagePath?: string | null;
  signatureImagePath?: string | null;
  values: CertificateValues;
  qrPngBuffer: Buffer;
}

function drawField(
  page: PDFPage,
  font: PDFFont,
  layout: CertificateFieldLayout | undefined,
  fallback: CertificateFieldLayout,
  text: string
) {
  if (!text) return;
  const resolved = layout ?? fallback;
  const size = resolved.size ?? 14;
  const textWidth = font.widthOfTextAtSize(text, size);
  let x = resolved.x;
  if (resolved.align === 'center') x = resolved.x - textWidth / 2;
  else if (resolved.align === 'right') x = resolved.x - textWidth;
  const [r, g, b] = resolved.color ?? [0.12, 0.12, 0.12];
  page.drawText(text, { x, y: resolved.y, size, font, color: rgb(r, g, b) });
}

async function embedImageFile(pdfDoc: PDFDocument, filePath: string) {
  const bytes = await readFile(filePath);
  return filePath.toLowerCase().endsWith('.png') ? pdfDoc.embedPng(bytes) : pdfDoc.embedJpg(bytes);
}

/** Renders a print-ready certificate PDF from a layout + field values + QR PNG. */
export async function renderCertificatePdf(input: RenderCertificateInput): Promise<Buffer> {
  const width = input.layout.pageWidth ?? 841.89;
  const height = input.layout.pageHeight ?? 595.28;

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([width, height]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  if (input.backgroundImagePath) {
    try {
      const image = await embedImageFile(pdfDoc, input.backgroundImagePath);
      page.drawImage(image, { x: 0, y: 0, width, height });
    } catch {
      // Missing/corrupt background: fall back to a plain bordered page below.
      page.drawRectangle({
        x: 20,
        y: 20,
        width: width - 40,
        height: height - 40,
        borderColor: rgb(0.09, 0.5, 0.3),
        borderWidth: 3,
      });
    }
  } else {
    page.drawRectangle({
      x: 20,
      y: 20,
      width: width - 40,
      height: height - 40,
      borderColor: rgb(0.09, 0.5, 0.3),
      borderWidth: 3,
    });
  }

  const f = input.layout.fields;
  const v = input.values;

  drawField(page, boldFont, f.participant_name, { x: width / 2, y: height * 0.58, size: 30, align: 'center' }, v.participant_name);
  drawField(page, font, f.designation, { x: width / 2, y: height * 0.5, size: 14, align: 'center' }, v.designation ?? '');
  drawField(page, boldFont, f.program_title, { x: width / 2, y: height * 0.4, size: 18, align: 'center' }, v.program_title);
  drawField(page, font, f.organized_by, { x: width / 2, y: height * 0.32, size: 12, align: 'center' }, `Organized by: ${v.organized_by}`);
  drawField(page, font, f.training_date, { x: width / 2, y: height * 0.25, size: 11, align: 'center' }, v.training_date);
  drawField(page, font, f.trainer_name, { x: 160, y: 110, size: 12, align: 'center' }, v.trainer_name ?? '');
  drawField(page, font, f.certificate_id, { x: width - 260, y: 40, size: 9 }, `Certificate ID: ${v.certificate_id}`);

  if (input.signatureImagePath) {
    try {
      const image = await embedImageFile(pdfDoc, input.signatureImagePath);
      const sigLayout = f.trainer_signature ?? { x: 100, y: 130, size: 130 };
      const sigWidth = sigLayout.size ?? 130;
      const scale = sigWidth / image.width;
      page.drawImage(image, { x: sigLayout.x, y: sigLayout.y, width: sigWidth, height: image.height * scale });
    } catch {
      // Missing signature file: certificate still renders without it.
    }
  }

  const qrImage = await pdfDoc.embedPng(input.qrPngBuffer);
  const qrLayout = f.qr_code ?? { x: width - 150, y: 90, size: 100 };
  const qrSize = qrLayout.size ?? 100;
  page.drawImage(qrImage, { x: qrLayout.x, y: qrLayout.y, width: qrSize, height: qrSize });

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
