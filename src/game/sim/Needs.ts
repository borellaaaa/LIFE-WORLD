/**
 * Necessidades do personagem (0–100). Decaem com o tempo de jogo e são
 * recuperadas por atividades. O humor é uma média ponderada.
 */
import type { NeedId } from '../state/store';
import { NEED_IDS } from '../state/store';

/** variação por hora de jogo sem atividade */
export const BASE_RATES: Record<NeedId, number> = {
  hunger: -6,
  energy: -4.4,
  hygiene: -3.6,
  fun: -4.8,
  social: -3.2,
};

export const NEED_LABELS: Record<NeedId, string> = {
  hunger: 'Fome',
  energy: 'Energia',
  hygiene: 'Higiene',
  fun: 'Diversão',
  social: 'Social',
};

const WEIGHTS: Record<NeedId, number> = { hunger: 1.3, energy: 1.2, hygiene: 0.9, fun: 1, social: 0.8 };

export class Needs {
  values: Record<NeedId, number>;
  private warned: Partial<Record<NeedId, boolean>> = {};
  onLow?: (id: NeedId) => void;

  constructor(initial: Record<NeedId, number>) {
    this.values = { ...initial };
  }

  /**
   * Avança `hours` horas de jogo aplicando o decaimento base mais os efeitos
   * (por hora) da atividade atual.
   */
  update(hours: number, effects: Partial<Record<NeedId, number>> = {}) {
    if (hours <= 0) return;
    for (const id of NEED_IDS) {
      const rate = BASE_RATES[id] + (effects[id] ?? 0);
      const v = Math.min(100, Math.max(0, this.values[id] + rate * hours));
      this.values[id] = v;
      if (v < 15 && !this.warned[id]) {
        this.warned[id] = true;
        this.onLow?.(id);
      } else if (v > 25) this.warned[id] = false;
    }
  }

  /** humor geral 0–100 (necessidades muito baixas pesam mais) */
  get mood() {
    let s = 0, w = 0;
    for (const id of NEED_IDS) {
      const v = this.values[id];
      const penalty = v < 20 ? (20 - v) * 0.8 : 0;
      s += (v - penalty) * WEIGHTS[id];
      w += WEIGHTS[id];
    }
    return Math.max(0, Math.min(100, s / w));
  }

  isFull(id: NeedId) {
    return this.values[id] >= 99.5;
  }
}

export function moodLabel(mood: number) {
  if (mood >= 80) return 'Radiante';
  if (mood >= 62) return 'Feliz';
  if (mood >= 45) return 'Bem';
  if (mood >= 28) return 'Desconfortável';
  return 'Péssimo';
}
