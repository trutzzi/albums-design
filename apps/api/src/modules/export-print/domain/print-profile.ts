export interface PrintProfile {
  id: string;
  name: string;
  dpi: number;
  /** Extra image area beyond the trim edge, in millimetres. */
  bleedMm: number;
  /** Safe area inset from trim where nothing important should sit. */
  safeMarginMm: number;
  drawTrimMarks: boolean;
  colorSpace: "sRGB" | "CMYK";
}

export const PRINT_PROFILES: readonly PrintProfile[] = [
  {
    id: "lab-standard-300",
    name: "Lab standard (300 dpi, 3mm bleed)",
    dpi: 300,
    bleedMm: 3,
    safeMarginMm: 5,
    drawTrimMarks: true,
    colorSpace: "sRGB",
  },
  {
    id: "lab-fine-art-360",
    name: "Fine art (360 dpi, 5mm bleed)",
    dpi: 360,
    bleedMm: 5,
    safeMarginMm: 8,
    drawTrimMarks: true,
    colorSpace: "sRGB",
  },
  {
    id: "client-proof-150",
    name: "Client proof (150 dpi, no bleed)",
    dpi: 150,
    bleedMm: 0,
    safeMarginMm: 0,
    drawTrimMarks: false,
    colorSpace: "sRGB",
  },
];

export const DEFAULT_PRINT_PROFILE_ID = "lab-standard-300";

export function findPrintProfile(id: string): PrintProfile | undefined {
  return PRINT_PROFILES.find((profile) => profile.id === id);
}

export const MM_TO_POINTS = 72 / 25.4;

export function mmToPoints(mm: number): number {
  return mm * MM_TO_POINTS;
}
