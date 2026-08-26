export interface CertificateFieldLayout {
  x: number;
  y: number;
  size?: number;
  color?: [number, number, number];
  align?: 'left' | 'center' | 'right';
}

export interface CertificateLayout {
  pageWidth?: number;
  pageHeight?: number;
  fields: Record<string, CertificateFieldLayout>;
}

// A4 landscape in points.
const WIDTH = 841.89;
const HEIGHT = 595.28;

/** Used whenever a program has no custom certificate_templates row selected. */
export const DEFAULT_CERTIFICATE_LAYOUT: CertificateLayout = {
  pageWidth: WIDTH,
  pageHeight: HEIGHT,
  fields: {
    participant_name: { x: WIDTH / 2, y: HEIGHT * 0.58, size: 30, align: 'center' },
    designation: { x: WIDTH / 2, y: HEIGHT * 0.5, size: 14, align: 'center' },
    program_title: { x: WIDTH / 2, y: HEIGHT * 0.4, size: 18, align: 'center' },
    organized_by: { x: WIDTH / 2, y: HEIGHT * 0.32, size: 12, align: 'center' },
    training_date: { x: WIDTH / 2, y: HEIGHT * 0.25, size: 11, align: 'center' },
    trainer_name: { x: 160, y: 110, size: 12, align: 'center' },
    trainer_signature: { x: 100, y: 130, size: 130 },
    certificate_id: { x: WIDTH - 260, y: 40, size: 9 },
    qr_code: { x: WIDTH - 150, y: 90, size: 100 },
  },
};

export function parseLayoutJson(layoutJson: string | null | undefined): CertificateLayout {
  if (!layoutJson) return DEFAULT_CERTIFICATE_LAYOUT;
  try {
    const parsed = JSON.parse(layoutJson);
    if (parsed && typeof parsed === 'object' && parsed.fields) {
      return parsed as CertificateLayout;
    }
    return DEFAULT_CERTIFICATE_LAYOUT;
  } catch {
    return DEFAULT_CERTIFICATE_LAYOUT;
  }
}
