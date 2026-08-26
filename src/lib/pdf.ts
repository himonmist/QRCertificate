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
  /** Optional organization logo for the default design's "Issued by" footer zone. Omitted entirely (no placeholder) when not provided. */
  logoImageBytes?: Buffer | null;
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

interface RichSegment {
  text: string;
  font: PDFFont;
  size: number;
  color?: [number, number, number];
}

function centeredX(font: PDFFont, text: string, size: number, pageWidth: number): number {
  return pageWidth / 2 - font.widthOfTextAtSize(text, size) / 2;
}

function drawCentered(
  page: PDFPage,
  font: PDFFont,
  text: string,
  size: number,
  y: number,
  pageWidth: number,
  color: [number, number, number] = [0.12, 0.12, 0.12]
) {
  const [r, g, b] = color;
  page.drawText(text, { x: centeredX(font, text, size, pageWidth), y, size, font, color: rgb(r, g, b) });
}

/** Draws several differently-styled runs on one baseline, centered as a single line (e.g. "CERTIFICATE" + italic "of" + "PARTICIPATION"). */
function drawCenteredRich(page: PDFPage, segments: RichSegment[], y: number, pageWidth: number, gap = 10) {
  const widths = segments.map((s) => s.font.widthOfTextAtSize(s.text, s.size));
  const total = widths.reduce((sum, w) => sum + w, 0) + gap * (segments.length - 1);
  let x = pageWidth / 2 - total / 2;
  segments.forEach((s, i) => {
    const [r, g, b] = s.color ?? [0.12, 0.12, 0.12];
    page.drawText(s.text, { x, y, size: s.size, font: s.font, color: rgb(r, g, b) });
    x += widths[i]! + gap;
  });
}

/** Draws a centered block of text, shrinking to fit and wrapping onto multiple lines if needed. Returns the y just below the last line drawn. */
function drawCenteredBlock(
  page: PDFPage,
  font: PDFFont,
  text: string,
  baseSize: number,
  topY: number,
  maxWidth: number,
  pageWidth: number,
  color: [number, number, number] = [0.12, 0.12, 0.12],
  minSize?: number
): number {
  const size = fitFontSizeToWidth(font, text, baseSize, maxWidth, minSize);
  const lines = font.widthOfTextAtSize(text, size) > maxWidth ? wrapTextToLines(font, text, size, maxWidth) : [text];
  const lineHeight = size * 1.25;
  lines.forEach((line, i) => drawCentered(page, font, line, size, topY - i * lineHeight, pageWidth, color));
  return topY - lines.length * lineHeight;
}

interface ParagraphRun {
  text: string;
  font: PDFFont;
}

interface WordToken {
  word: string;
  font: PDFFont;
}

function tokenizeRuns(runs: ParagraphRun[]): WordToken[] {
  const tokens: WordToken[] = [];
  for (const run of runs) {
    for (const word of run.text.split(/\s+/).filter(Boolean)) {
      tokens.push({ word, font: run.font });
    }
  }
  return tokens;
}

function wrapTokensToLines(tokens: WordToken[], size: number, maxWidth: number, spaceWidth: number): WordToken[][] {
  const lines: WordToken[][] = [];
  let current: WordToken[] = [];
  let currentWidth = 0;
  for (const token of tokens) {
    const wordWidth = token.font.widthOfTextAtSize(token.word, size);
    const addedWidth = current.length ? spaceWidth + wordWidth : wordWidth;
    if (current.length && currentWidth + addedWidth > maxWidth) {
      lines.push(current);
      current = [token];
      currentWidth = wordWidth;
    } else {
      current.push(token);
      currentWidth += addedWidth;
    }
  }
  if (current.length) lines.push(current);
  return lines;
}

/**
 * Draws a centered paragraph built from differently-styled runs (e.g. the
 * program title and date bold, everything else regular) as ONE flowing,
 * word-wrapped block — unlike drawCenteredBlock's single font, or
 * drawCenteredRich's single non-wrapping line. Shrinks the shared font size
 * first (same overflow-prevention rule as everywhere else) until the whole
 * paragraph fits within maxLines, then wraps at that size.
 */
function drawCenteredParagraph(
  page: PDFPage,
  runs: ParagraphRun[],
  baseSize: number,
  topY: number,
  maxWidth: number,
  pageWidth: number,
  color: [number, number, number] = [0.12, 0.12, 0.12],
  minSize = 10,
  maxLines = 4
): number {
  const tokens = tokenizeRuns(runs);
  const spaceFont = tokens[0]?.font ?? runs[0]!.font;

  let size = baseSize;
  let lines = wrapTokensToLines(tokens, size, maxWidth, spaceFont.widthOfTextAtSize(' ', size));
  while (lines.length > maxLines && size > minSize) {
    size -= 1;
    lines = wrapTokensToLines(tokens, size, maxWidth, spaceFont.widthOfTextAtSize(' ', size));
  }

  const spaceWidth = spaceFont.widthOfTextAtSize(' ', size);
  const lineHeight = size * 1.3;
  const [r, g, b] = color;

  lines.forEach((line, i) => {
    const lineWidth = line.reduce(
      (sum, t, idx) => sum + t.font.widthOfTextAtSize(t.word, size) + (idx > 0 ? spaceWidth : 0),
      0
    );
    let x = pageWidth / 2 - lineWidth / 2;
    const y = topY - i * lineHeight;
    line.forEach((t, idx) => {
      if (idx > 0) x += spaceWidth;
      page.drawText(t.word, { x, y, size, font: t.font, color: rgb(r, g, b) });
      x += t.font.widthOfTextAtSize(t.word, size);
    });
  });

  return topY - lines.length * lineHeight;
}

const CERT_GREEN: [number, number, number] = [0.05, 0.33, 0.19];
const CERT_MUTED: [number, number, number] = [0.35, 0.33, 0.3];
const CERT_INK: [number, number, number] = [0.12, 0.11, 0.1];
const CERT_CREAM: [number, number, number] = [0.996, 0.984, 0.937];

/**
 * The platform's own certificate design (used whenever a program has no
 * custom template background uploaded — the common case): an ornamental
 * double green border on a cream ground, "Certificate of Participation"
 * header, presented-to/name block, a completion paragraph, and left/center/
 * right footer zones for the supporting organization, issue date, and
 * chief trainer's signature — matching the org's real printed certificate.
 */
async function drawDefaultCertificateDesign(
  pdfDoc: PDFDocument,
  page: PDFPage,
  width: number,
  height: number,
  values: CertificateValues,
  signatureImageBytes: Buffer | null | undefined,
  logoImageBytes: Buffer | null | undefined
): Promise<void> {
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const italic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
  const nameFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic);

  const contentMaxWidth = width - 180;

  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(...CERT_CREAM) });
  page.drawRectangle({
    x: 28,
    y: 28,
    width: width - 56,
    height: height - 56,
    borderColor: rgb(...CERT_GREEN),
    borderWidth: 1.5,
  });
  page.drawRectangle({
    x: 18,
    y: 18,
    width: width - 36,
    height: height - 36,
    borderColor: rgb(...CERT_GREEN),
    borderWidth: 5,
  });

  let cursorY = height - 95;
  drawCenteredRich(
    page,
    [
      { text: 'CERTIFICATE', font: bold, size: 32 },
      { text: 'of', font: italic, size: 24, color: CERT_GREEN },
      { text: 'PARTICIPATION', font: bold, size: 32 },
    ],
    cursorY,
    width
  );

  cursorY -= 32;
  page.drawLine({ start: { x: width / 2 - 90, y: cursorY }, end: { x: width / 2 - 20, y: cursorY }, thickness: 1, color: rgb(...CERT_GREEN) });
  page.drawLine({ start: { x: width / 2 + 20, y: cursorY }, end: { x: width / 2 + 90, y: cursorY }, thickness: 1, color: rgb(...CERT_GREEN) });
  page.drawEllipse({ x: width / 2, y: cursorY, xScale: 4, yScale: 4, color: rgb(...CERT_GREEN) });

  cursorY -= 34;
  drawCentered(page, regular, 'THIS CERTIFICATE IS HEREWITH PRESENTED TO', 11, cursorY, width, CERT_MUTED);

  cursorY -= 48;
  cursorY = drawCenteredBlock(page, nameFont, values.participant_name, 28, cursorY, contentMaxWidth, width, CERT_INK, 16);

  cursorY -= 30;
  drawCenteredParagraph(
    page,
    [
      { text: 'He/She has successfully completed', font: regular },
      { text: `"${values.program_title}"`, font: bold },
      { text: 'on', font: regular },
      { text: values.location ? `${values.training_date},` : `${values.training_date}.`, font: bold },
      ...(values.location ? [{ text: `at ${values.location}.`, font: regular }] : []),
    ],
    13,
    cursorY,
    contentMaxWidth,
    width,
    CERT_INK,
    10
  );

  // Footer: three zones — supporting organization (left), issue date (center), chief trainer's signature (right).
  const zoneCenter = (font: PDFFont, text: string, size: number, cx: number, y: number, color: [number, number, number]) => {
    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: cx - w / 2, y, size, font, color: rgb(...color) });
  };
  // Like zoneCenter, but shrinks then wraps rather than letting a very long
  // organization/trainer name run past this footer zone's bounds (the same
  // overflow bug fixed for the main title, applied to the footer's zones).
  const zoneBlock = (
    font: PDFFont,
    text: string,
    baseSize: number,
    cx: number,
    topY: number,
    maxWidth: number,
    color: [number, number, number],
    minSize: number
  ) => {
    const size = fitFontSizeToWidth(font, text, baseSize, maxWidth, minSize);
    const lines = font.widthOfTextAtSize(text, size) > maxWidth ? wrapTextToLines(font, text, size, maxWidth) : [text];
    const lineHeight = size * 1.15;
    lines.forEach((line, i) => zoneCenter(font, line, size, cx, topY - i * lineHeight, color));
  };

  const footerLineY = 120;
  const orgX = 145;
  const dateX = width / 2;
  const sigX = width - 150;

  // Logo is entirely optional — drawn only when the program has one
  // uploaded, never as a placeholder mark, per the "if not selected then
  // not showing" requirement.
  if (logoImageBytes) {
    try {
      const image = await embedImageBytes(pdfDoc, logoImageBytes);
      const logoHeight = 30;
      const logoWidth = (image.width / image.height) * logoHeight;
      page.drawImage(image, { x: orgX - 100 - logoWidth, y: footerLineY - 27, width: logoWidth, height: logoHeight });
    } catch {
      // Missing/corrupt logo file: footer text still renders below.
    }
  }
  zoneCenter(regular, 'Issued by', 8, orgX, footerLineY - 12, CERT_MUTED);
  zoneBlock(bold, values.issued_by, 13, orgX, footerLineY - 30, 190, CERT_INK, 9);

  page.drawLine({ start: { x: dateX - 70, y: footerLineY }, end: { x: dateX + 70, y: footerLineY }, thickness: 1, color: rgb(...CERT_GREEN) });
  zoneCenter(bold, 'ON THIS DAY', 10, dateX, footerLineY - 14, CERT_INK);
  zoneBlock(italic, values.training_date, 12, dateX, footerLineY - 30, 190, CERT_INK, 8);

  if (signatureImageBytes) {
    try {
      const image = await embedImageBytes(pdfDoc, signatureImageBytes);
      const sigWidth = 130;
      const scale = sigWidth / image.width;
      page.drawImage(image, { x: sigX - sigWidth / 2, y: footerLineY + 6, width: sigWidth, height: image.height * scale });
    } catch {
      // Missing/corrupt signature file: signature line still renders below.
    }
  }
  page.drawLine({ start: { x: sigX - 70, y: footerLineY }, end: { x: sigX + 70, y: footerLineY }, thickness: 1, color: rgb(...CERT_GREEN) });
  if (values.trainer_name) {
    zoneCenter(bold, 'Chief Trainer', 10, sigX, footerLineY - 14, CERT_INK);
    zoneBlock(italic, values.trainer_name, 12, sigX, footerLineY - 30, 190, CERT_INK, 8);
  }

  page.drawText(`Certificate ID: ${values.certificate_id}`, { x: 40, y: 40, size: 8, font: regular, color: rgb(...CERT_MUTED) });
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

  if (input.backgroundImageBytes) {
    // A program with a custom uploaded template: draw the uploaded
    // background full-bleed and place each field at its configured
    // position — this is the only path admins can reposition via layoutJson.
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const f = input.layout.fields;
    const v = input.values;

    try {
      const image = await embedImageBytes(pdfDoc, input.backgroundImageBytes);
      page.drawImage(image, { x: 0, y: 0, width, height });
    } catch {
      // Missing/corrupt background: fall back to a plain bordered page.
      page.drawRectangle({
        x: 20,
        y: 20,
        width: width - 40,
        height: height - 40,
        borderColor: rgb(0.09, 0.5, 0.3),
        borderWidth: 3,
      });
    }

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
  } else {
    // No custom template: the platform's own "Certificate of Participation"
    // design (double green border, presented-to/name block, completion
    // paragraph, organization/date/signature footer).
    await drawDefaultCertificateDesign(pdfDoc, page, width, height, input.values, input.signatureImageBytes, input.logoImageBytes);

    const qrImage = await pdfDoc.embedPng(input.qrPngBuffer);
    const qrSize = 62;
    page.drawImage(qrImage, { x: width - 40 - qrSize, y: height - 40 - qrSize, width: qrSize, height: qrSize });
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
