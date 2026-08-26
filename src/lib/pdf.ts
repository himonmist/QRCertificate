import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
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
  backgroundImageBytes?: Buffer | null;
  signatureImageBytes?: Buffer | null;
  values: CertificateValues;
  qrPngBuffer: Buffer;
}

const FIELD_MARGIN = 40;
const MAX_WRAPPED_LINES = 3;

// Long program titles or participant names, at a template's fixed font
// size, can run past the printable page area — previously drawField just
// drew at the configured size with no bound, so a big-enough string bled
// off both edges of the certificate. Shrink to fit first, then wrap onto
// up to a few lines as a last resort, rather than letting text overflow.
export function wrapTextToLines(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);

  if (lines.length > MAX_WRAPPED_LINES) {
    const head = lines.slice(0, MAX_WRAPPED_LINES - 1);
    const tail = lines.slice(MAX_WRAPPED_LINES - 1).join(' ');
    return [...head, tail];
  }
  return lines;
}

/** Shrinks baseSize down to the largest size (no smaller than minSize) at which text fits within maxWidth. */
export function fitFontSizeToWidth(
  font: PDFFont,
  text: string,
  baseSize: number,
  maxWidth: number,
  minSize = Math.max(9, Math.round(baseSize * 0.55))
): number {
  let size = baseSize;
  while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidth) {
    size -= 1;
  }
  return size;
}

function drawField(
  page: PDFPage,
  font: PDFFont,
  layout: CertificateFieldLayout | undefined,
  fallback: CertificateFieldLayout,
  text: string,
  pageWidth: number
) {
  if (!text) return;
  const resolved = layout ?? fallback;
  const baseSize = resolved.size ?? 14;
  const [r, g, b] = resolved.color ?? [0.12, 0.12, 0.12];
  const maxWidth = pageWidth - FIELD_MARGIN * 2;

  const size = fitFontSizeToWidth(font, text, baseSize, maxWidth);

  const lines =
    font.widthOfTextAtSize(text, size) > maxWidth ? wrapTextToLines(font, text, size, maxWidth) : [text];

  const lineHeight = size * 1.2;
  const startY = resolved.y + ((lines.length - 1) * lineHeight) / 2;

  lines.forEach((line, i) => {
    const lineWidth = font.widthOfTextAtSize(line, size);
    let x = resolved.x;
    if (resolved.align === 'center') x = resolved.x - lineWidth / 2;
    else if (resolved.align === 'right') x = resolved.x - lineWidth;
    page.drawText(line, { x, y: startY - i * lineHeight, size, font, color: rgb(r, g, b) });
  });
}

function looksLikePng(bytes: Buffer): boolean {
  return (
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

// Sniffs the magic bytes rather than trusting a file extension/content-type,
// since these bytes may have come from a remote fetch (see loadImageBytes).
async function embedImageBytes(pdfDoc: PDFDocument, bytes: Buffer) {
  return looksLikePng(bytes) ? pdfDoc.embedPng(bytes) : pdfDoc.embedJpg(bytes);
}

/** Renders a print-ready certificate PDF from a layout + field values + QR PNG. */
export async function renderCertificatePdf(input: RenderCertificateInput): Promise<Buffer> {
  const width = input.layout.pageWidth ?? 841.89;
  const height = input.layout.pageHeight ?? 595.28;

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([width, height]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  if (input.backgroundImageBytes) {
    try {
      const image = await embedImageBytes(pdfDoc, input.backgroundImageBytes);
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

  drawField(page, boldFont, f.participant_name, { x: width / 2, y: height * 0.58, size: 30, align: 'center' }, v.participant_name, width);
  drawField(page, font, f.designation, { x: width / 2, y: height * 0.5, size: 14, align: 'center' }, v.designation ?? '', width);
  drawField(page, boldFont, f.program_title, { x: width / 2, y: height * 0.4, size: 18, align: 'center' }, v.program_title, width);
  drawField(page, font, f.organized_by, { x: width / 2, y: height * 0.32, size: 12, align: 'center' }, `Organized by: ${v.organized_by}`, width);
  drawField(page, font, f.training_date, { x: width / 2, y: height * 0.25, size: 11, align: 'center' }, v.training_date, width);
  drawField(page, font, f.trainer_name, { x: 160, y: 110, size: 12, align: 'center' }, v.trainer_name ?? '', width);
  drawField(page, font, f.certificate_id, { x: width - 260, y: 40, size: 9 }, `Certificate ID: ${v.certificate_id}`, width);

  if (input.signatureImageBytes) {
    try {
      const image = await embedImageBytes(pdfDoc, input.signatureImageBytes);
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
