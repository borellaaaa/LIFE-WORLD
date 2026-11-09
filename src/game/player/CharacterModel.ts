/**
 * Modelo do personagem (GLB) + controlador de animação.
 * - Locomoção com mistura idle/walk/run e velocidade de reprodução
 *   sincronizada com a velocidade real (pés não deslizam).
 * - Poses de atividade (Sit, Sleep, Use...) com transição suave.
 * - Funciona com qualquer GLB humanoide que tenha clipes com estes nomes.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { PoseClip } from '../sim/activities';

export const CHARACTER_URL = `${import.meta.env.BASE_URL}models/character.glb`;

interface Locomotion {
  walkSpeed: number;
  runSpeed: number;
}

export class CharacterModel {
  readonly root = new THREE.Group();
  private mixer!: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private loco: Locomotion = { walkSpeed: 1.17, runSpeed: 4.0 };
  private mode: 'locomotion' | PoseClip = 'locomotion';
  private w = { idle: 1, walk: 0, run: 0 };
  private poseAction: THREE.AnimationAction | null = null;
  private poseWeight = 0;

  static async load(onProgress?: (p: number) => void): Promise<CharacterModel> {
    const gltf = await new GLTFLoader().loadAsync(CHARACTER_URL, (e) => {
      if (e.total) onProgress?.(e.loaded / e.total);
    });
    const c = new CharacterModel();
    c.setup(gltf.scene, gltf.animations);
    return c;
  }

  private setup(scene: THREE.Group, clips: THREE.AnimationClip[]) {
    this.root.name = 'Player';
    this.root.add(scene);
    const meta = scene.getObjectByName('LifeWorldCharacter')?.userData?.lifeWorld ?? scene.userData?.lifeWorld;
    if (meta?.locomotion) this.loco = meta.locomotion as Locomotion;

    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mesh.material = mats.map((m) => upgradeMaterial(m as THREE.MeshStandardMaterial)) as unknown as THREE.Material;
      if (!Array.isArray(mesh.material) || (mesh.material as THREE.Material[]).length === 1) {
        mesh.material = Array.isArray(mesh.material) ? (mesh.material as THREE.Material[])[0] : mesh.material;
      }
    });

    this.mixer = new THREE.AnimationMixer(scene);
    for (const clip of clips) {
      const a = this.mixer.clipAction(clip);
      a.enabled = true;
      a.setEffectiveWeight(0);
      a.play();
      this.actions.set(clip.name, a);
    }
    this.actions.get('Idle')?.setEffectiveWeight(1);
  }

  get walkSpeed() {
    return this.loco.walkSpeed;
  }
  get runSpeed() {
    return this.loco.runSpeed;
  }

  /** Entra numa pose de atividade (ou volta à locomoção com `null`). */
  setPose(pose: PoseClip | null) {
    if (pose === null || pose === 'Idle') {
      this.mode = 'locomotion';
      return;
    }
    const a = this.actions.get(pose);
    if (!a) return;
    if (this.poseAction && this.poseAction !== a) this.poseAction.setEffectiveWeight(0);
    this.poseAction = a;
    a.time = 0;
    this.mode = pose;
  }

  /**
   * @param speed velocidade horizontal atual (m/s)
   * @param dt passo de tempo real
   */
  update(dt: number, speed: number) {
    const inPose = this.mode !== 'locomotion';
    const k = 1 - Math.exp(-dt * 9);
    this.poseWeight += ((inPose ? 1 : 0) - this.poseWeight) * (1 - Math.exp(-dt * 6));

    // pesos de locomoção alvo
    const { walkSpeed, runSpeed } = this.loco;
    let tIdle = 0, tWalk = 0, tRun = 0;
    if (speed < 0.08) tIdle = 1;
    else if (speed <= walkSpeed * 1.25) {
      const t = THREE.MathUtils.clamp(speed / (walkSpeed * 0.6), 0, 1);
      tIdle = 1 - t;
      tWalk = t;
    } else {
      const t = THREE.MathUtils.clamp((speed - walkSpeed * 1.25) / (runSpeed * 0.75 - walkSpeed * 1.25), 0, 1);
      tWalk = 1 - t;
      tRun = t;
    }
    this.w.idle += (tIdle - this.w.idle) * k;
    this.w.walk += (tWalk - this.w.walk) * k;
    this.w.run += (tRun - this.w.run) * k;
    const lw = 1 - this.poseWeight;
    this.actions.get('Idle')?.setEffectiveWeight(this.w.idle * lw);
    const walk = this.actions.get('Walk');
    const run = this.actions.get('Run');
    walk?.setEffectiveWeight(this.w.walk * lw);
    run?.setEffectiveWeight(this.w.run * lw);
    // sincroniza cadência com velocidade (fase compartilhada walk/run)
    const walkRate = THREE.MathUtils.clamp(speed / walkSpeed, 0.55, 1.6);
    const runRate = THREE.MathUtils.clamp(speed / runSpeed, 0.7, 1.3);
    if (walk) walk.timeScale = walkRate;
    if (run) run.timeScale = runRate;
    if (this.poseAction) {
      this.poseAction.setEffectiveWeight(this.poseWeight);
      if (!inPose && this.poseWeight < 0.01) {
        this.poseAction.setEffectiveWeight(0);
        this.poseAction = null;
      }
    }
    this.mixer.update(dt);
  }
}

/** Melhora materiais exportados (pele com brilho suave, tecido com sheen). */
function upgradeMaterial(m: THREE.MeshStandardMaterial): THREE.Material {
  if (!m || !m.isMeshStandardMaterial) return m;
  const base = {
    name: m.name, color: m.color, roughness: m.roughness, metalness: 0, vertexColors: m.vertexColors,
  };
  switch (m.name) {
    case 'Skin':
      return new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.58, sheen: 0.25, sheenColor: new THREE.Color('#ffb59a'), sheenRoughness: 0.6 });
    case 'Shirt':
    case 'Pants':
      return new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.9, sheen: 0.25, sheenRoughness: 0.85, sheenColor: new THREE.Color(m.color).offsetHSL(0, -0.1, 0.12) });
    case 'Hair':
      return new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.48, sheen: 0.4, sheenColor: new THREE.Color('#6b4a35'), sheenRoughness: 0.4 });
    case 'Eye':
      return new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02 });
    default:
      return m;
  }
}
