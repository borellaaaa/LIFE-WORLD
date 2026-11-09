/**
 * Mundo físico (Rapier). Colisores estáticos do cenário, corpos cinemáticos
 * (portas) e consultas (raycast da câmera).
 */
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

/** Grupos de colisão (bits). */
export const G = {
  WORLD: 0x0001, // chão, paredes, construções — bloqueia jogador e câmera
  PROPS: 0x0002, // móveis, árvores, objetos — bloqueia jogador (câmera ignora)
  PLAYER: 0x0004,
  DOOR: 0x0008, // portas — bloqueia jogador e câmera
  ROOF: 0x0010, // telhado/forro — câmera só colide quando o jogador está fora
} as const;

/** Monta o valor de InteractionGroups do Rapier: (membros << 16) | filtro. */
export const groups = (membership: number, filter: number) => ((membership & 0xffff) << 16) | (filter & 0xffff);

export type RapierModule = typeof RAPIER;

export class Physics {
  static async create(): Promise<Physics> {
    await RAPIER.init();
    return new Physics();
  }

  readonly R = RAPIER;
  readonly world: RAPIER.World;
  private fixedBody: RAPIER.RigidBody;
  colliderCount = 0;

  private constructor() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = 1 / 60;
    this.fixedBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  }

  step() {
    this.world.step();
  }

  /** Caixa estática. `center` = centro; `half` = meia-extensão; rotação opcional em Y. */
  addBox(center: THREE.Vector3Like, half: THREE.Vector3Like, opts: { rotY?: number; group?: number } = {}) {
    const desc = RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z)
      .setTranslation(center.x, center.y, center.z)
      .setCollisionGroups(groups(opts.group ?? G.WORLD, 0xffff))
      .setFriction(0.6);
    if (opts.rotY) {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), opts.rotY);
      desc.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    }
    this.colliderCount++;
    return this.world.createCollider(desc, this.fixedBody);
  }

  /** Caixa estática a partir de um Object3D com BoxGeometry/limites (usa bounding box mundial). */
  addBoxFromBounds(box: THREE.Box3, group: number = G.PROPS) {
    const c = box.getCenter(new THREE.Vector3());
    const s = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    return this.addBox(c, s, { group });
  }

  addCylinder(center: THREE.Vector3Like, halfHeight: number, radius: number, group: number = G.PROPS) {
    const desc = RAPIER.ColliderDesc.cylinder(halfHeight, radius)
      .setTranslation(center.x, center.y, center.z)
      .setCollisionGroups(groups(group, 0xffff));
    this.colliderCount++;
    return this.world.createCollider(desc, this.fixedBody);
  }

  /** Corpo cinemático controlado por posição (portas). */
  addKinematicBox(center: THREE.Vector3Like, half: THREE.Vector3Like, group: number = G.DOOR) {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(center.x, center.y, center.z),
    );
    const col = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z).setCollisionGroups(groups(group, 0xffff)),
      body,
    );
    this.colliderCount++;
    return { body, collider: col };
  }

  /**
   * Raycast. Retorna distância até o primeiro impacto (ou null).
   * `mask` = grupos que o raio considera.
   */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, mask: number, exclude?: RAPIER.Collider): number | null {
    const ray = new RAPIER.Ray(origin, dir);
    const hit = this.world.castRay(ray, maxDist, true, undefined, groups(0xffff, mask), exclude);
    return hit ? hit.timeOfImpact : null;
  }

  /** Esfera de varredura (melhor que raio para a câmera não "entrar" em quinas). */
  sphereCast(origin: THREE.Vector3, dir: THREE.Vector3, radius: number, maxDist: number, mask: number): number | null {
    const shape = new RAPIER.Ball(radius);
    const hit = this.world.castShape(
      origin, { x: 0, y: 0, z: 0, w: 1 }, dir, shape, 0, maxDist, true, undefined, groups(0xffff, mask),
    );
    return hit ? hit.time_of_impact : null;
  }
}
