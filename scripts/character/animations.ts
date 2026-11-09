/**
 * Animações procedurais (keyframes) do personagem — 100% originais.
 *
 * Cada animação é descrita por uma função de pose em função da fase (0..1).
 * As poses são amostradas, os pés são apoiados no chão via cinemática direta
 * (FK) e o resultado vira AnimationClip do three.js, exportado no GLB.
 */
import * as THREE from 'three';
import { BONES, SOLE_POINTS, L, R } from './humanoid';
import { cross, norm } from './sdf';

type BonePose = { rx?: number; ry?: number; rz?: number; flex?: number };
export interface Pose {
  bones: Record<string, BonePose>;
  hips?: { x?: number; y?: number; z?: number };
}

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

/** Gaussiana circular na fase. */
const g = (p: number, c: number, w: number) => {
  let d = (((p - c) % 1) + 1.5) % 1 - 0.5;
  d /= w;
  return Math.exp(-0.5 * d * d);
};
const cos = (x: number) => Math.cos(TAU * x);
const sin = (x: number) => Math.sin(TAU * x);

// Eixos de flexão dos cotovelos (perpendicular ao braço na pose A, para frente = +)
const ELBOW_AXIS = {
  LeftForeArm: new THREE.Vector3(...norm(cross(L.d, [0, 0, 1]))),
  RightForeArm: new THREE.Vector3(...norm(cross(R.d, [0, 0, 1]))),
};
const ARM_DOWN = 39; // graus para baixar os braços da pose A

// ---------------------------------------------------------------------------
// Construção do esqueleto para FK
// ---------------------------------------------------------------------------
export function buildSkeleton(): { root: THREE.Bone; bones: Map<string, THREE.Bone> } {
  const bones = new Map<string, THREE.Bone>();
  let root!: THREE.Bone;
  for (const def of BONES) {
    const b = new THREE.Bone();
    b.name = def.name;
    const parent = def.parent ? BONES.find((d) => d.name === def.parent)! : null;
    const px = parent ? parent.pos : [0, 0, 0];
    b.position.set(def.pos[0] - px[0], def.pos[1] - px[1], def.pos[2] - px[2]);
    bones.set(def.name, b);
    if (def.parent) bones.get(def.parent)!.add(b);
    else root = b;
  }
  root.updateMatrixWorld(true);
  return { root, bones };
}

const tmpE = new THREE.Euler();
const tmpQ = new THREE.Quaternion();

function boneQuat(name: string, bp: BonePose | undefined, out: THREE.Quaternion) {
  out.identity();
  if (!bp) return out;
  tmpE.set((bp.rx ?? 0) * DEG, (bp.ry ?? 0) * DEG, (bp.rz ?? 0) * DEG, 'XYZ');
  out.setFromEuler(tmpE);
  if (bp.flex) {
    const axis = ELBOW_AXIS[name as keyof typeof ELBOW_AXIS];
    if (axis) {
      tmpQ.setFromAxisAngle(axis, bp.flex * DEG);
      out.multiply(tmpQ);
    }
  }
  return out;
}

const HIPS_BIND = BONES[0].pos;

function applyPose(bones: Map<string, THREE.Bone>, pose: Pose, root: THREE.Bone) {
  for (const def of BONES) boneQuat(def.name, pose.bones[def.name], bones.get(def.name)!.quaternion);
  root.position.set(
    HIPS_BIND[0] + (pose.hips?.x ?? 0),
    HIPS_BIND[1] + (pose.hips?.y ?? 0),
    HIPS_BIND[2] + (pose.hips?.z ?? 0),
  );
  root.updateMatrixWorld(true);
}

const soleLocal: { bone: string; local: THREE.Vector3 }[] = [];
for (const [bone, pts] of Object.entries(SOLE_POINTS)) {
  const def = BONES.find((b) => b.name === bone)!;
  for (const p of pts) soleLocal.push({ bone, local: new THREE.Vector3(p[0] - def.pos[0], p[1] - def.pos[1], p[2] - def.pos[2]) });
}

function soleWorld(bones: Map<string, THREE.Bone>) {
  return soleLocal.map((s) => s.local.clone().applyMatrix4(bones.get(s.bone)!.matrixWorld));
}

// ---------------------------------------------------------------------------
// Poses
// ---------------------------------------------------------------------------
function armsRelaxed(phase: number, amp = 1): Record<string, BonePose> {
  return {
    LeftArm: { rz: -ARM_DOWN + 0.6 * amp * sin(phase), rx: 2 },
    RightArm: { rz: ARM_DOWN - 0.6 * amp * sin(phase + 0.3), rx: 2 },
    LeftForeArm: { flex: 9 + amp * sin(phase + 0.1) },
    RightForeArm: { flex: 10 + amp * sin(phase + 0.4) },
    LeftHand: { rz: 4, ry: -6 },
    RightHand: { rz: -4, ry: 6 },
  };
}

export const POSES: Record<string, { duration: number; frames: number; ground: 'solve' | 'run' | 'none'; pose: (p: number) => Pose }> = {
  Idle: {
    duration: 4.2,
    frames: 42,
    ground: 'solve',
    pose: (p) => {
      const breath = sin(p * 2);
      return {
        hips: { x: 0.011 * sin(p), z: 0 },
        bones: {
          Hips: { rz: 1.4 * sin(p), ry: 1.2 * sin(p + 0.25) },
          Spine: { rx: 1 + 0.5 * breath, rz: -0.8 * sin(p) },
          Spine1: { rx: 0.6 * breath },
          Spine2: { rx: -0.8 * breath, rz: -0.5 * sin(p) },
          Neck: { rx: 2 + 0.4 * breath },
          Head: { rx: -1.5, ry: 4 * sin(p + 0.15) * Math.abs(sin(p * 0.5)), rz: -0.6 * sin(p) },
          LeftShoulder: { rz: 0.7 * breath },
          RightShoulder: { rz: -0.7 * breath },
          ...armsRelaxed(p * 2, 1),
          LeftUpLeg: { rx: -1.5, rz: -1.4 * sin(p) - 1 },
          RightUpLeg: { rx: 0.5, rz: -1.4 * sin(p) + 1.5 },
          LeftLeg: { rx: 2.5 + 1.2 * Math.max(0, -sin(p)) },
          RightLeg: { rx: 2.5 + 2 * Math.max(0, sin(p)) },
          LeftFoot: { rx: -1, rz: 1.4 * sin(p) },
          RightFoot: { rx: -2.5, rz: 1.4 * sin(p) },
        },
      };
    },
  },

  Walk: {
    duration: 1.08,
    frames: 36,
    ground: 'solve',
    pose: (f) => {
      const leg = (p: number) => ({
        hip: 9 + 21 * cos(p + 0.04),
        knee: 4 + 14 * g(p, 0.12, 0.06) + 56 * g(p, 0.71, 0.1),
        ankle: 4 * g(p, 0.05, 0.03) - 10 * g(p, 0.4, 0.1) + 16 * g(p, 0.6, 0.045) - 7 * g(p, 0.8, 0.08),
        toe: -24 * g(p, 0.57, 0.05),
      });
      const l = leg(f), r = leg(f + 0.5);
      const armL = 13 * cos(f - 0.5) - 3;
      const armR = 13 * cos(f) - 3;
      const yaw = -5 * cos(f);
      return {
        hips: { x: 0.012 * sin(f) },
        bones: {
          Hips: { ry: yaw, rz: 2.2 * sin(f), rx: 1 },
          Spine: { rx: 2, ry: 2 * cos(f) },
          Spine1: { rx: 1.5, ry: 2 * cos(f) },
          Spine2: { rx: -0.5, ry: 2.5 * cos(f), rz: -1 * sin(f) },
          Neck: { rx: 1.5, ry: -0.8 * cos(f) },
          Head: { rx: -2, ry: -0.5 * cos(f) },
          LeftShoulder: { rz: -1 * cos(f - 0.5) },
          RightShoulder: { rz: 1 * cos(f) },
          LeftArm: { rz: -ARM_DOWN + 1.5, rx: -armL },
          RightArm: { rz: ARM_DOWN - 1.5, rx: -armR },
          LeftForeArm: { flex: 16 + 12 * Math.max(0, cos(f - 0.5)) },
          RightForeArm: { flex: 16 + 12 * Math.max(0, cos(f)) },
          LeftHand: { rz: 4, ry: -8 },
          RightHand: { rz: -4, ry: 8 },
          LeftUpLeg: { rx: -l.hip, rz: -1 },
          RightUpLeg: { rx: -r.hip, rz: 1 },
          LeftLeg: { rx: l.knee },
          RightLeg: { rx: r.knee },
          LeftFoot: { rx: l.ankle },
          RightFoot: { rx: r.ankle },
          LeftToeBase: { rx: l.toe },
          RightToeBase: { rx: r.toe },
        },
      };
    },
  },

  Run: {
    duration: 0.7,
    frames: 28,
    ground: 'run',
    pose: (f) => {
      const leg = (p: number) => ({
        hip: 16 + 34 * cos(p + 0.07),
        knee: 22 + 22 * g(p, 0.14, 0.07) + 88 * g(p, 0.68, 0.13),
        ankle: -10 * g(p, 0.16, 0.07) + 24 * g(p, 0.38, 0.06) - 6 * g(p, 0.8, 0.1),
        toe: -18 * g(p, 0.36, 0.05),
      });
      const l = leg(f), r = leg(f + 0.5);
      const armL = 30 * cos(f - 0.5) + 2;
      const armR = 30 * cos(f) + 2;
      return {
        hips: { x: 0.008 * sin(f) },
        bones: {
          Hips: { ry: -9 * cos(f), rz: 2.5 * sin(f), rx: 6 },
          Spine: { rx: 4, ry: 3 * cos(f) },
          Spine1: { rx: 3, ry: 3 * cos(f) },
          Spine2: { rx: 1, ry: 4 * cos(f) },
          Neck: { rx: -2 },
          Head: { rx: -6, ry: -1 * cos(f) },
          LeftShoulder: { rz: -2 * cos(f - 0.5) },
          RightShoulder: { rz: 2 * cos(f) },
          LeftArm: { rz: -ARM_DOWN + 8, rx: -armL },
          RightArm: { rz: ARM_DOWN - 8, rx: -armR },
          LeftForeArm: { flex: 78 + 16 * cos(f - 0.5) },
          RightForeArm: { flex: 78 + 16 * cos(f) },
          LeftHand: { rz: 8, ry: -10 },
          RightHand: { rz: -8, ry: 10 },
          LeftUpLeg: { rx: -l.hip, rz: -1 },
          RightUpLeg: { rx: -r.hip, rz: 1 },
          LeftLeg: { rx: l.knee },
          RightLeg: { rx: r.knee },
          LeftFoot: { rx: l.ankle },
          RightFoot: { rx: r.ankle },
          LeftToeBase: { rx: l.toe },
          RightToeBase: { rx: r.toe },
        },
      };
    },
  },

  // Sentado: quadril (junta) a 0.555 m do chão => assento a ~0.45 m.
  Sit: {
    duration: 3.6,
    frames: 24,
    ground: 'none',
    pose: (p) => {
      const breath = sin(p);
      return {
        hips: { y: 0.555 - HIPS_BIND[1], z: -0.02 },
        bones: {
          Hips: { rx: -4 },
          Spine: { rx: 2 + 0.5 * breath },
          Spine1: { rx: 2 + 0.4 * breath },
          Spine2: { rx: -0.6 * breath },
          Neck: { rx: 4 },
          Head: { rx: 2, ry: 3 * sin(p + 0.2) },
          LeftArm: { rz: -ARM_DOWN + 9, rx: -14 },
          RightArm: { rz: ARM_DOWN - 9, rx: -14 },
          LeftForeArm: { flex: 52 },
          RightForeArm: { flex: 52 },
          LeftHand: { rx: 16, rz: 6 },
          RightHand: { rx: 16, rz: -6 },
          LeftUpLeg: { rx: -88, rz: -4 },
          RightUpLeg: { rx: -88, rz: 4 },
          LeftLeg: { rx: 88 },
          RightLeg: { rx: 88 },
          LeftFoot: { rx: 2 },
          RightFoot: { rx: 2 },
        },
      };
    },
  },

  // Sentado usando o computador (digitando)
  SitUse: {
    duration: 1.6,
    frames: 24,
    ground: 'none',
    pose: (p) => ({
      hips: { y: 0.555 - HIPS_BIND[1], z: -0.02 },
      bones: {
        Hips: { rx: -2 },
        Spine: { rx: 6 },
        Spine1: { rx: 4 },
        Spine2: { rx: 2 },
        Neck: { rx: 4 },
        Head: { rx: 4 },
        LeftArm: { rz: -ARM_DOWN + 12, rx: -42, ry: 6 },
        RightArm: { rz: ARM_DOWN - 12, rx: -42, ry: -6 },
        LeftForeArm: { flex: 74 + 4 * sin(p * 2) },
        RightForeArm: { flex: 74 + 4 * sin(p * 2 + 0.5) },
        LeftHand: { rx: 6 + 6 * Math.max(0, sin(p * 4)), rz: 20 },
        RightHand: { rx: 6 + 6 * Math.max(0, sin(p * 4 + 0.5)), rz: -20 },
        LeftUpLeg: { rx: -88, rz: -4 },
        RightUpLeg: { rx: -88, rz: 4 },
        LeftLeg: { rx: 88 },
        RightLeg: { rx: 88 },
        LeftFoot: { rx: 2 },
        RightFoot: { rx: 2 },
      },
    }),
  },

  // Deitado de costas (cabeça em -Z da origem). Quadril a 0.66 m (colchão ~0.54 m).
  Sleep: {
    duration: 5,
    frames: 25,
    ground: 'none',
    pose: (p) => {
      const breath = sin(p);
      return {
        hips: { y: 0.66 - HIPS_BIND[1], z: 0 },
        bones: {
          Hips: { rx: -90 },
          Spine: { rx: 0.8 * breath },
          Spine1: { rx: 0.6 * breath },
          Spine2: { rx: -1 * breath },
          Neck: { rx: 12 },
          Head: { rx: 6, ry: 12 },
          LeftArm: { rz: -ARM_DOWN + 4, rx: -6 },
          RightArm: { rz: ARM_DOWN - 10, rx: -12 },
          LeftForeArm: { flex: 12 },
          RightForeArm: { flex: 38 },
          LeftUpLeg: { rx: -6, rz: 3 },
          RightUpLeg: { rx: -10, rz: -3 },
          LeftLeg: { rx: 8 },
          RightLeg: { rx: 14 },
          LeftFoot: { rx: 30 },
          RightFoot: { rx: 30 },
        },
      };
    },
  },

  // Em pé usando bancada / geladeira / pia
  Use: {
    duration: 2,
    frames: 24,
    ground: 'solve',
    pose: (p) => ({
      bones: {
        Hips: { rx: 2 },
        Spine: { rx: 5 },
        Spine1: { rx: 4 },
        Spine2: { rx: 2 },
        Neck: { rx: 6 },
        Head: { rx: 10, ry: 4 * sin(p) },
        LeftArm: { rz: -ARM_DOWN + 10, rx: -40 + 6 * sin(p * 2), ry: 4 },
        RightArm: { rz: ARM_DOWN - 10, rx: -46 + 6 * sin(p * 2 + 0.5), ry: -4 },
        LeftForeArm: { flex: 62 + 8 * sin(p * 2 + 0.2) },
        RightForeArm: { flex: 66 + 8 * sin(p * 2 + 0.7) },
        LeftHand: { rx: 10, rz: 16 },
        RightHand: { rx: 10, rz: -16 },
        LeftUpLeg: { rx: -2, rz: -1.5 },
        RightUpLeg: { rx: -1, rz: 1.5 },
        LeftLeg: { rx: 4 },
        RightLeg: { rx: 4 },
      },
    }),
  },

  // Em pé falando ao telefone (mão direita na orelha)
  Phone: {
    duration: 3.2,
    frames: 32,
    ground: 'solve',
    pose: (p) => ({
      hips: { x: -0.012 },
      bones: {
        Hips: { rz: -2, ry: 4 * sin(p) },
        Spine: { rx: 1, rz: 1 },
        Spine1: { rx: 0.5 },
        Neck: { rx: 2, rz: -4 },
        Head: { rx: -2, rz: -6, ry: 8 * sin(p) },
        ...armsRelaxed(p, 1.5),
        RightShoulder: { rz: -6 },
        RightArm: { rz: ARM_DOWN - 18, rx: -48, ry: -10 },
        RightForeArm: { flex: 138 },
        RightHand: { rx: -20, rz: -10 },
        LeftArm: { rz: -ARM_DOWN + 4, rx: 2 + 10 * Math.max(0, sin(p * 2)) * -1 },
        LeftForeArm: { flex: 18 + 20 * Math.max(0, sin(p * 2)) },
        LeftUpLeg: { rx: -1, rz: -3 },
        RightUpLeg: { rx: 0, rz: 3 },
        LeftLeg: { rx: 2 },
        RightLeg: { rx: 5 },
      },
    }),
  },
};

// ---------------------------------------------------------------------------
// Amostragem -> AnimationClip
// ---------------------------------------------------------------------------
export interface ClipResult {
  clip: THREE.AnimationClip;
  /** velocidade natural (m/s) em que os pés não deslizam (walk/run) */
  naturalSpeed?: number;
}

export function buildClips(): { clips: ClipResult[]; report: string[] } {
  const { root, bones } = buildSkeleton();
  const report: string[] = [];
  const clips: ClipResult[] = [];

  for (const [name, def] of Object.entries(POSES)) {
    const N = def.frames;
    const times: number[] = [];
    const quats = new Map<string, number[]>();
    const hipPos: number[] = [];
    const groundOffsets: number[] = [];
    const sole: THREE.Vector3[][] = [];

    // 1º passo: pose crua + solução de apoio dos pés
    const rawPoses: Pose[] = [];
    for (let i = 0; i <= N; i++) {
      const phase = (i % N) / N;
      const pose = def.pose(phase);
      rawPoses.push(pose);
      applyPose(bones, pose, root);
      const pts = soleWorld(bones);
      const minY = Math.min(...pts.map((p) => p.y));
      groundOffsets.push(def.ground === 'none' ? 0 : -minY);
    }

    // Corrida: fase aérea — o quadril nunca desce abaixo do necessário,
    // mas sobe suavemente nos momentos sem apoio.
    let offsets = groundOffsets;
    if (def.ground === 'run') {
      const mean = groundOffsets.reduce((a, b) => a + b, 0) / groundOffsets.length;
      offsets = groundOffsets.map((o, i) => {
        const ph = (i % N) / N;
        const bob = mean + 0.012 + 0.022 * Math.cos(TAU * 2 * (ph - 0.44));
        return Math.max(o, bob);
      });
    }

    for (let i = 0; i <= N; i++) {
      const phase = (i % N) / N;
      const pose = rawPoses[i];
      const p2: Pose = { ...pose, hips: { ...pose.hips, y: (pose.hips?.y ?? 0) + offsets[i] } };
      applyPose(bones, p2, root);
      sole.push(soleWorld(bones));
      times.push(phase * def.duration + (i === N ? def.duration - phase * def.duration : 0));
      hipPos.push(root.position.x, root.position.y, root.position.z);
      for (const b of BONES) {
        const q = bones.get(b.name)!.quaternion;
        const arr = quats.get(b.name) ?? [];
        // continuidade de sinal
        if (arr.length >= 4) {
          const n = arr.length;
          const d = arr[n - 4] * q.x + arr[n - 3] * q.y + arr[n - 2] * q.z + arr[n - 1] * q.w;
          if (d < 0) q.set(-q.x, -q.y, -q.z, -q.w);
        }
        arr.push(q.x, q.y, q.z, q.w);
        quats.set(b.name, arr);
      }
    }

    const tracks: THREE.KeyframeTrack[] = [
      new THREE.VectorKeyframeTrack('Hips.position', times, hipPos),
    ];
    for (const b of BONES) tracks.push(new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, quats.get(b.name)!));
    const clip = new THREE.AnimationClip(name, def.duration, tracks);

    // Velocidade natural: velocidade do ponto de apoio enquanto está no chão.
    let naturalSpeed: number | undefined;
    if (name === 'Walk' || name === 'Run') {
      let sum = 0, cnt = 0;
      const dt = def.duration / N;
      for (let i = 0; i < N; i++) {
        const a = sole[i], b = sole[i + 1];
        for (let s = 0; s < a.length; s++) {
          if (a[s].y < 0.004 && b[s].y < 0.004) {
            sum += -(b[s].z - a[s].z) / dt;
            cnt++;
          }
        }
      }
      naturalSpeed = cnt ? sum / cnt : undefined;
    }
    const minSole = Math.min(...sole.flat().map((p) => p.y));
    report.push(`${name}: ${N} frames, ${def.duration}s, minSoleY=${minSole.toFixed(4)}${naturalSpeed ? `, naturalSpeed=${naturalSpeed.toFixed(3)} m/s` : ''}`);
    clips.push({ clip, naturalSpeed });
  }
  return { clips, report };
}
