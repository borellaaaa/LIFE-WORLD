/** Configurações do jogador, persistidas no navegador (localStorage). */

export type ShadowQuality = 'off' | 'low' | 'high';
export type GraphicsPreset = 'low' | 'medium' | 'high';

export interface Settings {
  mouseSensitivity: number; // 0.2 .. 3
  invertY: boolean;
  fov: number; // 50 .. 85
  renderScale: number; // 0.5 .. 1
  shadows: ShadowQuality;
  grassDensity: number; // 0 .. 1
  showFps: boolean;
  uiScale: number; // 0.85 .. 1.2
}

export const DEFAULT_SETTINGS: Settings = {
  mouseSensitivity: 1,
  invertY: false,
  fov: 62,
  renderScale: 1,
  shadows: 'high',
  grassDensity: 0.7,
  showFps: false,
  uiScale: 1,
};

const KEY = 'lifeworld3d.settings.v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* armazenamento indisponível: segue sem persistir */
  }
}

export function applyPreset(p: GraphicsPreset): Partial<Settings> {
  switch (p) {
    case 'low': return { renderScale: 0.7, shadows: 'off', grassDensity: 0.25 };
    case 'medium': return { renderScale: 0.85, shadows: 'low', grassDensity: 0.5 };
    case 'high': return { renderScale: 1, shadows: 'high', grassDensity: 0.8 };
  }
}
