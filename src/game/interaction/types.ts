/**
 * Contratos do sistema de interação. Qualquer objeto do mundo pode se tornar
 * interativo implementando `Interactable` e registrando-se no InteractionSystem.
 */
import type * as THREE from 'three';
import type { ActivityDef } from '../sim/activities';

export interface InteractionContext {
  startActivity(def: ActivityDef): void;
  toast(text: string, kind?: 'info' | 'good' | 'warn' | 'money'): void;
  money(): number;
  playerPosition(): THREE.Vector3;
}

export interface InteractionAction {
  key: 'E' | 'F';
  label: string;
  hint?: string;
  disabled?: boolean;
  run: (ctx: InteractionContext) => void;
}

export interface Interactable {
  id: string;
  /** título exibido no prompt (ex.: "Geladeira") */
  name: string;
  /** ponto de foco em coordenadas de mundo */
  position: THREE.Vector3;
  /** distância máxima para interagir (m) */
  radius: number;
  /** ações disponíveis no momento */
  actions: (ctx: InteractionContext) => InteractionAction[];
  /** se false, ignora o teste de "estar de frente" */
  requireFacing?: boolean;
}
