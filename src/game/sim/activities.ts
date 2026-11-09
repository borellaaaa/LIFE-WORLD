/**
 * Atividades: o que o personagem faz ao interagir com um objeto
 * (dormir, comer, tomar banho...). Efeitos são aplicados por HORA de jogo.
 */
import type * as THREE from 'three';
import type { NeedId } from '../state/store';

export type PoseClip = 'Idle' | 'Sit' | 'SitUse' | 'Sleep' | 'Use' | 'Phone';

export interface Placement {
  position: THREE.Vector3;
  /** direção para onde o personagem olha (rad, 0 = +Z) */
  yaw: number;
}

export interface ActivityDef {
  id: string;
  label: string;
  icon: string;
  pose: PoseClip;
  /** onde o modelo fica durante a atividade */
  anchor: Placement;
  /** onde o jogador fica ao sair (padrão: onde estava) */
  exit?: Placement;
  /** duração em minutos de jogo (sem duração = até encher a necessidade ou cancelar) */
  durationMin?: number;
  /** variação das necessidades por hora de jogo (somada ao decaimento normal) */
  effects: Partial<Record<NeedId, number>>;
  moneyPerHour?: number;
  cost?: number;
  /** termina sozinha quando esta necessidade chegar a 100 */
  stopWhenFull?: NeedId;
  /** multiplicador de velocidade do tempo enquanto ativa (ex.: dormir) */
  timeScale?: number;
  startText?: string;
  endText?: string;
  onStart?: () => void;
  onEnd?: () => void;
}
