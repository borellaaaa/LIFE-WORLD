/**
 * Estado compartilhado entre o motor do jogo (Three.js) e a interface (React).
 * O jogo escreve aqui em taxa limitada; a UI apenas lê/reage.
 */
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { loadSettings, saveSettings, type Settings } from './settings';

export type NeedId = 'hunger' | 'energy' | 'hygiene' | 'fun' | 'social';
export const NEED_IDS: NeedId[] = ['hunger', 'energy', 'hygiene', 'fun', 'social'];

export type Phase = 'loading' | 'title' | 'playing' | 'error';
export type MenuId = 'none' | 'pause' | 'settings' | 'controls';

export interface PromptAction {
  key: 'E' | 'F';
  label: string;
  /** texto auxiliar, ex.: "-$12 • 45 min" */
  hint?: string;
  disabled?: boolean;
}

export interface PromptState {
  title: string;
  actions: PromptAction[];
}

export interface ActivityState {
  label: string;
  icon: string;
  /** 0..1 ou null para atividades sem fim definido */
  progress: number | null;
}

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'good' | 'warn' | 'money';
}

export interface UIState {
  phase: Phase;
  loading: { progress: number; label: string };
  error: string | null;
  menu: MenuId;
  pointerLocked: boolean;
  playerName: string;
  money: number;
  clock: { day: number; weekday: number; minutes: number; speed: number; paused: boolean };
  needs: Record<NeedId, number>;
  mood: number;
  prompt: PromptState | null;
  activity: ActivityState | null;
  toasts: Toast[];
  location: string;
  fps: number;
  settings: Settings;
}

export const gameStore = createStore<UIState>(() => ({
  phase: 'loading',
  loading: { progress: 0, label: 'Iniciando...' },
  error: null,
  menu: 'none',
  pointerLocked: false,
  playerName: 'Lucas Moreira',
  money: 1500,
  clock: { day: 1, weekday: 0, minutes: 8 * 60, speed: 1, paused: false },
  needs: { hunger: 72, energy: 85, hygiene: 80, fun: 60, social: 55 },
  mood: 70,
  prompt: null,
  activity: null,
  toasts: [],
  location: 'Rua das Acácias',
  fps: 0,
  settings: loadSettings(),
}));

export function useGame<T>(selector: (s: UIState) => T): T {
  return useStore(gameStore, selector);
}

let toastId = 1;
export function pushToast(text: string, kind: Toast['kind'] = 'info', ttl = 4200) {
  const id = toastId++;
  gameStore.setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind }] }));
  window.setTimeout(() => {
    gameStore.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  }, ttl);
}

export function updateSettings(patch: Partial<Settings>) {
  const next = { ...gameStore.getState().settings, ...patch };
  saveSettings(next);
  gameStore.setState({ settings: next });
}

export function setMenu(menu: MenuId) {
  gameStore.setState({ menu });
}
