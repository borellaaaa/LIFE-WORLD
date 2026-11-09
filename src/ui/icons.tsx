/** Ícones SVG originais da interface (traço simples, herdam currentColor). */
import type { ReactElement } from 'react';

type P = { size?: number; className?: string };
const S = ({ size = 18, className, children }: P & { children: ReactElement | ReactElement[] }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}
    strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{children}</svg>
);

export const IconHunger = (p: P) => (
  <S {...p}><path d="M7 3v7a2 2 0 0 0 2 2v9" /><path d="M11 3v7a2 2 0 0 1-2 2" /><path d="M9 3v6" /><path d="M17 21V3c-2 1.2-3 3.5-3 7 0 1.6.8 2.5 3 2.5" /></S>
);
export const IconEnergy = (p: P) => <S {...p}><path d="M13 2 4.5 13.5H12L11 22l8.5-11.5H12L13 2Z" /></S>;
export const IconHygiene = (p: P) => (
  <S {...p}><path d="M12 2.8c3.6 4.2 6 7.6 6 10.7a6 6 0 0 1-12 0c0-3.1 2.4-6.5 6-10.7Z" /><path d="M9.2 14.2a3 3 0 0 0 2.6 2.6" /></S>
);
export const IconFun = (p: P) => (
  <S {...p}><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" /><path d="M9 9.5h.01M15 9.5h.01" /></S>
);
export const IconSocial = (p: P) => (
  <S {...p}><path d="M4 5h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" /><path d="M19 9h1a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-1v3l-3.5-3" /></S>
);
export const IconCoin = (p: P) => (
  <S {...p}><circle cx="12" cy="12" r="9" /><path d="M14.8 9.2c-.5-.9-1.6-1.4-2.8-1.4-1.6 0-2.8.8-2.8 2.1 0 2.9 5.8 1.6 5.8 4.3 0 1.3-1.3 2.1-3 2.1-1.3 0-2.5-.6-3-1.6M12 6v1.8M12 16.3V18" /></S>
);
export const IconPause = (p: P) => <S {...p}><path d="M8 5v14M16 5v14" /></S>;
export const IconPlay = (p: P) => <S {...p}><path d="M7 5l11 7-11 7V5Z" /></S>;
export const IconFast = (p: P) => <S {...p}><path d="M4 6l7 6-7 6V6ZM13 6l7 6-7 6V6Z" /></S>;
export const IconUltra = (p: P) => <S {...p}><path d="M2 6l6 6-6 6V6ZM9 6l6 6-6 6V6ZM16 6l6 6-6 6V6Z" /></S>;
export const IconGear = (p: P) => (
  <S {...p}><circle cx="12" cy="12" r="3.2" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></S>
);
export const IconPin = (p: P) => <S {...p}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.4" /></S>;
export const IconSun = (p: P) => <S {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></S>;
export const IconMoon = (p: P) => <S {...p}><path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11Z" /></S>;
export const IconKeyboard = (p: P) => <S {...p}><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></S>;
export const IconHome = (p: P) => <S {...p}><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v10h13V10" /><path d="M10 20v-5h4v5" /></S>;

export const ActivityIcons: Record<string, (p: P) => ReactElement> = {
  tv: (p) => <S {...p}><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M8 21h8M12 17v4" /></S>,
  sofa: (p) => <S {...p}><path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3" /><path d="M2 13a2 2 0 0 1 4 0v2h12v-2a2 2 0 0 1 4 0v5H2v-5Z" /></S>,
  book: (p) => <S {...p}><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z" /><path d="M19 19v2H6" /></S>,
  phone: (p) => <S {...p}><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></S>,
  work: (p) => <S {...p}><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M2 20h20" /></S>,
  game: (p) => <S {...p}><path d="M6 9h12a4 4 0 0 1 0 8c-1.5 0-2.3-1-3-2H9c-.7 1-1.5 2-3 2a4 4 0 0 1 0-8Z" /><path d="M8 12v2M7 13h2M15.5 12.5h.01M17 14h.01" /></S>,
  food: IconHunger,
  cook: (p) => <S {...p}><path d="M4 11h16v3a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6v-3Z" /><path d="M2 11h20M9 4c0 1 1 1.5 1 2.5S9 8 9 8M14 4c0 1 1 1.5 1 2.5S14 8 14 8" /></S>,
  water: IconHygiene,
  chair: (p) => <S {...p}><path d="M7 3v9h10V3M5 12h14M7 12v9M17 12v9" /></S>,
  sleep: IconMoon,
  shower: (p) => <S {...p}><path d="M4 21V7a4 4 0 0 1 8 0" /><path d="M9 7h6M10 11v1M13 11v1M16 11v1M11.5 14v1M14.5 14v1" /></S>,
  toilet: (p) => <S {...p}><path d="M6 3h7v7H6zM4 10h14a4 4 0 0 1-4 4H9l1 7" /></S>,
};
