/**
 * Porta articulada com colisor cinemático. Abre para o lado oposto ao jogador
 * (empurrando), anima suavemente e bloqueia a passagem quando fechada.
 */
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { Physics, G } from '../physics/Physics';
import type { Materials } from '../world/materials';
import type { Interactable } from './types';

export interface DoorSpec {
  id: string;
  name: string;
  /** posição da dobradiça (base) em coordenadas de mundo */
  hinge: THREE.Vector3;
  /** ângulo Y da folha fechada: a folha se estende ao longo do eixo +X local */
  yaw: number;
  width: number;
  height: number;
  style: 'wood' | 'white';
  exterior?: boolean;
}

export class Door implements Interactable {
  readonly id: string;
  readonly name: string;
  readonly position = new THREE.Vector3();
  readonly radius = 1.7;
  readonly requireFacing = true;
  readonly pivot = new THREE.Group();
  private body: RAPIER.RigidBody;
  private angle = 0; // atual (rad, relativo ao fechado)
  private target = 0;
  private openDir = 1;
  private half: THREE.Vector3;
  isOpen = false;
  onToggle?: (open: boolean) => void;

  constructor(private spec: DoorSpec, mats: Materials, physics: Physics, parent: THREE.Object3D) {
    this.id = spec.id;
    this.name = spec.name;
    const { width: w, height: h } = spec;
    const thick = 0.045;
    this.pivot.position.copy(spec.hinge);
    this.pivot.rotation.y = spec.yaw;
    parent.add(this.pivot);

    const leafMat = spec.style === 'wood' ? mats.doorWood : mats.doorWhite;
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(w - 0.01, h - 0.01, thick), leafMat);
    leaf.position.set(w / 2, h / 2, 0);
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    this.pivot.add(leaf);
    if (spec.style === 'wood') {
      // frisos horizontais decorativos (porta de entrada)
      for (let i = 0; i < 5; i++) {
        const groove = new THREE.Mesh(new THREE.BoxGeometry(w - 0.24, 0.012, thick + 0.004), mats.blackMatte);
        groove.position.set(w / 2, 0.45 + i * 0.32, 0);
        this.pivot.add(groove);
      }
    }
    // maçanetas dos dois lados
    for (const side of [1, -1]) {
      const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.012, 16), mats.handle);
      rose.rotation.x = Math.PI / 2;
      rose.position.set(w - 0.08, 1.02, side * (thick / 2 + 0.006));
      const lever = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.018, 0.022), mats.handle);
      lever.position.set(w - 0.13, 1.02, side * (thick / 2 + 0.04));
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.04, 8), mats.handle);
      neck.rotation.x = Math.PI / 2;
      neck.position.set(w - 0.08, 1.02, side * (thick / 2 + 0.022));
      this.pivot.add(rose, lever, neck);
    }

    this.half = new THREE.Vector3(w / 2 - 0.01, h / 2, thick / 2 + 0.02);
    const c = this.leafCenterWorld(0);
    const { body } = physics.addKinematicBox(c, this.half, G.DOOR);
    this.body = body;
    this.syncBody();
    this.position.copy(this.leafCenterWorld(0)).setY(spec.hinge.y + 1.0);
  }

  private leafCenterWorld(angle: number) {
    const yaw = this.spec.yaw + angle;
    return new THREE.Vector3(
      this.spec.hinge.x + Math.cos(yaw) * (this.spec.width / 2),
      this.spec.hinge.y + this.spec.height / 2,
      this.spec.hinge.z - Math.sin(yaw) * (this.spec.width / 2),
    );
  }

  private syncBody() {
    const yaw = this.spec.yaw + this.angle;
    const c = this.leafCenterWorld(this.angle);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.body.setNextKinematicTranslation(c);
    this.body.setNextKinematicRotation(q);
  }

  /** Abre/fecha. `from` = posição do jogador (a porta abre para longe dele). */
  toggle(from?: THREE.Vector3) {
    if (!this.isOpen) {
      if (from) {
        // normal da folha fechada (eixo Z local da folha)
        const n = new THREE.Vector3(Math.sin(this.spec.yaw), 0, Math.cos(this.spec.yaw));
        const side = Math.sign(n.dot(from.clone().sub(this.spec.hinge))) || 1;
        // girar positivo leva a folha para o lado -n: abre para o lado oposto ao jogador
        this.openDir = side > 0 ? 1 : -1;
      }
      this.target = this.openDir * THREE.MathUtils.degToRad(100);
      this.isOpen = true;
    } else {
      this.target = 0;
      this.isOpen = false;
    }
    this.onToggle?.(this.isOpen);
  }

  update(dt: number) {
    if (Math.abs(this.angle - this.target) < 1e-4) return;
    const speed = 3.2; // rad/s
    const diff = this.target - this.angle;
    const step = Math.sign(diff) * Math.min(Math.abs(diff), speed * dt * (0.35 + Math.min(1, Math.abs(diff) * 1.5)));
    this.angle += step;
    this.pivot.rotation.y = this.spec.yaw + this.angle;
    this.syncBody();
  }

  actions() {
    return [{
      key: 'E' as const,
      label: this.isOpen ? 'Fechar porta' : 'Abrir porta',
      run: (ctx: { playerPosition(): THREE.Vector3 }) => this.toggle(ctx.playerPosition()),
    }];
  }
}
