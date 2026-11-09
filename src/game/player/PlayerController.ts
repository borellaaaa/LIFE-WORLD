/**
 * Controle do jogador com o Kinematic Character Controller do Rapier:
 * cápsula com gravidade, degraus automáticos, aderência ao chão e colisão
 * com paredes, móveis e portas. O modelo gira na direção do movimento.
 */
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { Physics, G, groups } from '../physics/Physics';
import type { Input } from '../core/Input';
import type { CharacterModel } from './CharacterModel';
import type { Placement } from '../sim/activities';

const RADIUS = 0.27;
/**
 * Colisor cilíndrico (base plana): o auto-step do Rapier só sobe degraus quando o
 * contato é com uma face vertical — com a base arredondada de uma cápsula, degraus
 * menores que o raio viram "rampas" e travam o personagem.
 */
const HALF_H = 0.87; // altura total 1.74 m
const CENTER_Y = HALF_H + 0.015; // centro do colisor acima dos pés (inclui o offset do KCC)
const GRAVITY = 20;
const DOWN = new THREE.Vector3(0, -1, 0);

export class PlayerController {
  readonly feet = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  yaw = 0; // direção do modelo (rad)
  grounded = false;
  locked = false;
  walkSpeed = 1.55;
  runSpeed = 4.3;
  private body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  private kcc: RAPIER.KinematicCharacterController;
  private vy = 0;
  private tmp = new THREE.Vector3();
  /** posição visual (modelo) — pode diferir da cápsula durante atividades */
  private visualTarget: Placement | null = null;
  private visualPos = new THREE.Vector3();
  private visualYaw = 0;
  private blend = 1;

  constructor(private physics: Physics, private model: CharacterModel, spawn: Placement) {
    const R = physics.R;
    this.feet.copy(spawn.position);
    this.yaw = spawn.yaw;
    this.body = physics.world.createRigidBody(
      R.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.position.x, spawn.position.y + CENTER_Y, spawn.position.z),
    );
    this.collider = physics.world.createCollider(
      R.ColliderDesc.cylinder(HALF_H, RADIUS).setCollisionGroups(groups(G.PLAYER, G.WORLD | G.PROPS | G.DOOR)),
      this.body,
    );
    this.kcc = physics.world.createCharacterController(0.015);
    this.kcc.setUp({ x: 0, y: 1, z: 0 });
    this.kcc.enableAutostep(0.3, 0.12, false);
    this.kcc.enableSnapToGround(0.3);
    this.kcc.setMaxSlopeClimbAngle((45 * Math.PI) / 180);
    this.kcc.setMinSlopeSlideAngle((50 * Math.PI) / 180);
    this.kcc.setSlideEnabled(true);
    this.kcc.setApplyImpulsesToDynamicBodies(false);
    this.visualPos.copy(this.feet);
    this.visualYaw = this.yaw;
  }

  /** velocidade horizontal (para animação) */
  get speed() {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  teleport(p: Placement) {
    this.feet.copy(p.position);
    this.yaw = p.yaw;
    this.body.setTranslation({ x: p.position.x, y: p.position.y + CENTER_Y, z: p.position.z }, true);
    this.body.setNextKinematicTranslation({ x: p.position.x, y: p.position.y + CENTER_Y, z: p.position.z });
    this.velocity.set(0, 0, 0);
    this.vy = 0;
    this.visualPos.copy(p.position);
    this.visualYaw = p.yaw;
  }

  /** Coloca o modelo numa âncora de atividade (a cápsula fica onde está). */
  setVisualAnchor(p: Placement | null) {
    this.visualTarget = p;
    this.blend = 0;
  }

  update(dt: number, input: Input, cameraYaw: number) {
    // --- entrada -> direção desejada relativa à câmera
    let mx = 0, mz = 0;
    if (!this.locked) {
      if (input.isDown('KeyW') || input.isDown('ArrowUp')) mz += 1;
      if (input.isDown('KeyS') || input.isDown('ArrowDown')) mz -= 1;
      if (input.isDown('KeyA') || input.isDown('ArrowLeft')) mx -= 1;
      if (input.isDown('KeyD') || input.isDown('ArrowRight')) mx += 1;
    }
    const len = Math.hypot(mx, mz);
    const running = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const target = this.tmp.set(0, 0, 0);
    if (len > 0) {
      mx /= len; mz /= len;
      // frente da câmera no plano XZ
      const fx = -Math.sin(cameraYaw), fz = -Math.cos(cameraYaw);
      const rx = -fz, rz = fx;
      target.set(fx * mz + rx * mx, 0, fz * mz + rz * mx).multiplyScalar(running ? this.runSpeed : this.walkSpeed);
    }
    // aceleração suave (mais rápida para frear)
    const accel = len > 0 ? (running ? 9 : 11) : 14;
    const k = 1 - Math.exp(-accel * dt);
    this.velocity.x += (target.x - this.velocity.x) * k;
    this.velocity.z += (target.z - this.velocity.z) * k;

    // gravidade
    if (this.grounded && this.vy < 0) this.vy = -2;
    else this.vy -= GRAVITY * dt;
    this.vy = Math.max(this.vy, -30);

    const desired = { x: this.velocity.x * dt, y: this.vy * dt, z: this.velocity.z * dt };
    this.kcc.computeColliderMovement(this.collider, desired, this.physics.R.QueryFilterFlags.EXCLUDE_SENSORS, groups(0xffff, G.WORLD | G.PROPS | G.DOOR));
    const mv = this.kcc.computedMovement();
    this.grounded = this.kcc.computedGrounded();
    const cur = this.body.translation();
    const next = { x: cur.x + mv.x, y: cur.y + mv.y, z: cur.z + mv.z };
    this.body.setNextKinematicTranslation(next);
    // velocidade efetiva (bater numa parede zera a componente bloqueada)
    if (dt > 0) {
      const ex = mv.x / dt, ez = mv.z / dt;
      if (Math.hypot(ex, ez) < Math.hypot(this.velocity.x, this.velocity.z) * 0.98) {
        this.velocity.x = ex;
        this.velocity.z = ez;
      }
    }
    if (this.grounded && this.vy < 0) this.vy = -2;
    // pés: projeta no chão real sob a cápsula (evita afundar/flutuar alguns cm)
    let footY = next.y - CENTER_Y;
    if (this.grounded) {
      const hit = this.physics.raycast(this.tmp.set(next.x, next.y, next.z), DOWN, CENTER_Y + 0.25, G.WORLD | G.PROPS, this.collider);
      if (hit !== null) footY = next.y - hit;
    }
    this.feet.set(next.x, footY, next.z);

    // rotação na direção do movimento
    if (Math.hypot(this.velocity.x, this.velocity.z) > 0.15 && len > 0) {
      const want = Math.atan2(this.velocity.x, this.velocity.z);
      let d = want - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * (1 - Math.exp(-12 * dt));
    }

    // posição visual do modelo
    this.blend = Math.min(1, this.blend + dt * 3.2);
    const goal = this.visualTarget ?? { position: this.feet, yaw: this.yaw };
    const t = this.visualTarget ? smoothstep(this.blend) : 1;
    if (this.visualTarget) {
      this.visualPos.lerp(goal.position, t);
      let dy = goal.yaw - this.visualYaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.visualYaw += dy * t;
    } else {
      // volta da âncora: aproxima rapidamente da cápsula
      const kk = 1 - Math.exp(-dt * 14);
      this.visualPos.lerp(this.feet, this.blend < 1 ? kk : 1);
      let dy = this.yaw - this.visualYaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.visualYaw += dy * (this.blend < 1 ? kk : 1);
    }
    this.model.root.position.copy(this.visualPos);
    this.model.root.rotation.y = this.visualYaw;
    this.model.update(dt, this.locked ? 0 : this.speed);
  }
}

function smoothstep(t: number) {
  return t * t * (3 - 2 * t);
}

export const PLAYER_EYE_HEIGHT = 1.62;
