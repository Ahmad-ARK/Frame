// ISO 3166-1 alpha-2 → numeric, for auto-highlighting the country a geocoded
// place sits in (Nominatim returns the alpha-2 code). Covers the countries that
// actually come up in history/geopolitics documentaries; unknowns just skip
// auto-highlight (the LLM's explicit isoNumeric still applies).

const ALPHA2_TO_NUMERIC: Record<string, number> = {
  AF: 4, AL: 8, DZ: 12, AO: 24, AR: 32, AM: 51, AU: 36, AT: 40, AZ: 31,
  BD: 50, BY: 112, BE: 56, BO: 68, BA: 70, BR: 76, BG: 100, KH: 116, CM: 120,
  CA: 124, CL: 152, CN: 156, CO: 170, CD: 180, CG: 178, CU: 192, CZ: 203,
  DK: 208, DO: 214, EC: 218, EG: 818, SV: 222, ER: 232, EE: 233, ET: 231,
  FI: 246, FR: 250, GE: 268, DE: 276, GH: 288, GR: 300, GT: 320, HT: 332,
  HN: 340, HU: 348, IS: 352, IN: 356, ID: 360, IR: 364, IQ: 368, IE: 372,
  IL: 376, IT: 380, CI: 384, JM: 388, JP: 392, JO: 400, KZ: 398, KE: 404,
  KP: 408, KR: 410, KW: 414, KG: 417, LA: 418, LV: 428, LB: 422, LY: 434,
  LT: 440, MG: 450, MY: 458, ML: 466, MX: 484, MD: 498, MN: 496, MA: 504,
  MZ: 508, MM: 104, NA: 516, NP: 524, NL: 528, NZ: 554, NI: 558, NE: 562,
  NG: 566, NO: 578, OM: 512, PK: 586, PS: 275, PA: 591, PG: 598, PY: 600,
  PE: 604, PH: 608, PL: 616, PT: 620, QA: 634, RO: 642, RU: 643, RW: 646,
  SA: 682, SN: 686, RS: 688, SL: 694, SG: 702, SK: 703, SI: 705, SO: 706,
  ZA: 710, SS: 728, ES: 724, LK: 144, SD: 729, SE: 752, CH: 756, SY: 760,
  TW: 158, TJ: 762, TZ: 834, TH: 764, TN: 788, TR: 792, TM: 795, UG: 800,
  UA: 804, AE: 784, GB: 826, US: 840, UY: 858, UZ: 860, VE: 862, VN: 704,
  YE: 887, ZM: 894, ZW: 716,
};

/** ISO 3166-1 alpha-2 (e.g. "IN") → numeric ("356"), or undefined if unknown. */
export function alpha2ToNumeric(code?: string): string | undefined {
  if (!code) return undefined;
  const n = ALPHA2_TO_NUMERIC[code.toUpperCase()];
  return n !== undefined ? String(n) : undefined;
}
