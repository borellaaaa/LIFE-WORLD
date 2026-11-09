/**
 * Encontra o objeto interativo em foco (perto e à frente do jogador),
 * publica o prompt para a UI e executa ações com as teclas E/F.
 */
import * as THREE from 'three';
import type { Interactable, InteractionAction, InteractionContext } from './types';
import { gameStore, type PromptState } from '../state/store';
import type { Input } from '../core/Input';

export class InteractionSystem {
  private items: Interactable[] = [];
  focused: Interactable | null = null;
  private lastPromptKey = '';
  enabled = true;

  constructor(private ctx: InteractionContext) {}

  register(...items: Interactable[]) {
    this.items.push(...items);
  }

  get all() {
    return this.items;
  }

  update(playerPos: THREE.Vector3, playerYaw: number, cameraForward: THREE.Vector3, input: Input) {
    let best: Interactable | null = null;
    let bestScore = Infinity;
    if (this.enabled) {
      const facing = new THREE.Vector3(Math.sin(playerYaw), 0, Math.cos(playerYaw));
      const camF = new THREE.Vector3(cameraForward.x, 0, cameraForward.z).normalize();
      for (const it of this.items) {
        const dx = it.position.x - playerPos.x, dz = it.position.z - playerPos.z;
        const dy = it.position.y - (playerPos.y + 1);
        if (Math.abs(dy) > 2) continue;
        const d = Math.hypot(dx, dz);
        if (d > it.radius) continue;
        const to = new THREE.Vector3(dx, 0, dz).normalize();
        // prioridade: para onde o PERSONAGEM olha; a câmera só ajuda a curta distância
        const fF = to.dot(facing);
        const fC = to.dot(camF);
        const byFacing = fF > 0.1;
        const byCamera = !byFacing && fC > 0.5 && d < 1.2;
        if (it.requireFacing !== false && d > 0.6 && !byFacing && !byCamera) continue;
        let score = d * (2 - Math.max(0, fF) - 0.3 * Math.max(0, fC));
        if (!byFacing) score *= 2.5; // só pela câmera: perde para o que está à frente do personagem
        if (score < bestScore) {
          bestScore = score;
          best = it;
        }
      }
    }
    this.focused = best;

    let actions: InteractionAction[] = [];
    if (best) actions = best.actions(this.ctx);
    const prompt: PromptState | null = best && actions.length
      ? { title: best.name, actions: actions.map(({ key, label, hint, disabled }) => ({ key, label, hint, disabled })) }
      : null;
    const key = prompt ? `${best!.id}|${prompt.actions.map((a) => a.key + a.label + a.hint + a.disabled).join(',')}` : '';
    if (key !== this.lastPromptKey) {
      this.lastPromptKey = key;
      gameStore.setState({ prompt });
    }

    if (best) {
      for (const a of actions) {
        if (input.wasPressed(a.key === 'E' ? 'KeyE' : 'KeyF')) {
          if (a.disabled) this.ctx.toast('Dinheiro insuficiente.', 'warn');
          else a.run(this.ctx);
          break;
        }
      }
    }
  }
}
