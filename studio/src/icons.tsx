// One tidy stroke-icon set. All inherit currentColor + the .icn stroke rules from
// styles.css. Kept inline (no icon dep) so the bundle stays tiny on a slow link.
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const S = (props: P, d: React.ReactNode) => (
  <svg viewBox="0 0 24 24" className="icn" {...props}>
    {d}
  </svg>
);

export const IconArrow = (p: P) => S(p, <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>);
export const IconPlus = (p: P) => S(p, <><path d="M12 5v14" /><path d="M5 12h14" /></>);
export const IconCheck = (p: P) => S(p, <path d="m5 12 4.5 4.5L19 7" />);
export const IconPlay = (p: P) => (
  <svg viewBox="0 0 24 24" {...p}>
    <path d="M8 5v14l11-7z" fill="currentColor" stroke="none" />
  </svg>
);
export const IconScript = (p: P) =>
  S(p, <><path d="M6 3h9l4 4v14H6z" /><path d="M9 9h6M9 13h6M9 17h4" /></>);
export const IconTopic = (p: P) =>
  S(p, <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>);
export const IconMic = (p: P) =>
  S(p, <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>);
export const IconShuffle = (p: P) =>
  S(p, <><path d="M16 4h4v4M4 20l16-16M4 4l5 5M15 15l5 5M20 16v4h-4" /></>);
export const IconUpload = (p: P) =>
  S(p, <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M5 20h14" /></>);
export const IconSpark = (p: P) =>
  S(p, <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />);
export const IconWarn = (p: P) =>
  S(p, <><path d="M12 9v4M12 17h.01" /><path d="M10.3 4 3 17h18L13.7 4a2 2 0 0 0-3.4 0Z" /></>);
export const IconClose = (p: P) => S(p, <><path d="M6 6l12 12M18 6 6 18" /></>);
export const IconHome = (p: P) =>
  S(p, <><path d="M4 11 12 4l8 7" /><path d="M6 10v10h12V10" /></>);
export const IconGrid = (p: P) =>
  S(p, <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>);
export const IconBack = (p: P) => S(p, <><path d="M19 12H5" /><path d="m11 6-6 6 6 6" /></>);
export const IconDownload = (p: P) =>
  S(p, <><path d="M12 4v12M7 11l5 5 5-5" /><path d="M5 20h14" /></>);
