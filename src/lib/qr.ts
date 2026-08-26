import QRCode from 'qrcode';

/** Renders a QR PNG encoding the given short verification URL (never raw JSON). */
export async function generateQrPngBuffer(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, { type: 'png', margin: 1, width: 320, errorCorrectionLevel: 'M' });
}
