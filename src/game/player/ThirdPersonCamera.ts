/**
 * Câmera em terceira pessoa: órbita controlada pelo mouse, zoom na roda,
 * acompanhamento suave e colisão (não atravessa paredes).
 */
import * as THREE from 'three';
import { Physics, G } from '../physics/Physics';

export class ThirdPersonCamera {
  yaw = 0; // rad — 0 = câmera em +Z olhando para -Z
  pitch = 0.32; // elevação (rad)
  distance = 4.2;
  private current = 4.2;
  private focus = new THREE.Vector3();
  private initialized = false;
  indoor = false;
  private dir = new THREE.Vector3();
  private desired = new THREE.Vector3();

  constructor(readonly camera: THREE.PerspectiveCamera, private physics: Physics) {}

  /** posiciona a câmera atrás do personagem */
  snapBehind(yaw: number) {
    this.yaw = yaw + Math.PI;
    this.initialized = false;
  }

  rotate(dx: number, dy: number, sensitivity: number, invertY: boolean) {
    const s = 0.0024 * sensitivity;
    this.yaw -= dx * s;
    this.pitch += dy * s * (invertY ? -1 : 1);
    this.pitch = THREE.MathUtils.clamp(this.pitch, -0.45, 1.25);
  }

  zoom(steps: number) {
    this.distance = THREE.MathUtils.clamp(this.distance + steps * 0.45, 1.4, 8);
  }

  update(dt: number, target: THREE.Vector3, headHeight: number) {
    const goal = new THREE.Vector3(target.x, target.y + headHeight, target.z);
    if (!this.initialized) {
      this.focus.copy(goal);
      this.current = this.distance;
      this.initialized = true;
    } else {
      const k = 1 - Math.exp(-dt * 10);
      this.focus.lerp(goal, k);
    }
    const maxDist = this.indoor ? Math.min(this.distance, 3.4) : this.distance;
    this.dir.set(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    // leve deslocamento lateral (ombro) para não tapar o centro da tela
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const pivot = this.focus.clone().addScaledVector(right, 0.28 * Math.min(1, this.current / 3));

    // colisão: esfera varrida do pivô até a posição desejada
    const mask = G.WORLD | G.DOOR | (this.indoor ? 0 : G.ROOF);
    const hit = this.physics.sphereCast(pivot, this.dir, 0.22, maxDist, mask);
    const allowed = hit !== null ? Math.max(0.35, hit - 0.05) : maxDist;
    // aproxima rápido ao colidir, afasta devagar
    const rate = allowed < this.current ? 22 : 3.5;
    this.current += (allowed - this.current) * (1 - Math.exp(-dt * rate));
    if (this.current > allowed) this.current = allowed;

    this.desired.copy(pivot).addScaledVector(this.dir, this.current);
    this.camera.position.copy(this.desired);
    this.camera.lookAt(pivot);
  }

  /** distância atual (o jogo esconde o personagem se a câmera estiver dentro dele) */
  get currentDistance() {
    return this.current;
  }

  /** frente da câmera no plano (rad), usada pelo controle WASD */
  get forwardYaw() {
    return this.yaw;
  }
}
