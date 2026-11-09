/**
 * Definição anatômica do personagem original "Lucas" do LIFE WORLD 3D.
 *
 * - Esqueleto com nomes no padrão Mixamo (Hips, Spine, LeftArm...), para que no
 *   futuro modelos feitos em Blender/Mixamo possam substituir este sem mudar o jogo.
 * - Corpo esculpido por primitivas SDF agrupadas por "zona" (para pesos de skin)
 *   e por "material" (pele, camiseta, calça, tênis...).
 *
 * Convenções: metros, Y para cima, personagem olhando para +Z, esquerda do
 * personagem = +X. Pose de ligação (bind pose) em "A" com braços a 45°.
 */
import {
  Vec3, SDF, v3, add, scale, norm, cross, sub, lerp3,
  sphere, ellipsoid, orientedEllipsoid, capsule, roundCone, roundBox, torusY,
} from './sdf';

export type Zone =
  | 'head' | 'neck' | 'torso' | 'pelvis'
  | 'shoulderL' | 'shoulderR' | 'armL' | 'armR' | 'handL' | 'handR'
  | 'legL' | 'legR' | 'footL' | 'footR';

export type MaterialName = 'Skin' | 'Lips' | 'Shirt' | 'Pants' | 'Shoes' | 'Sole' | 'Hair';

export interface Part {
  name: string;
  zone: Zone;
  material: MaterialName;
  /** add = união suave, hard = união rígida (bordas de roupa), sub = subtração suave */
  op: 'add' | 'hard' | 'sub';
  k: number;
  sdf: SDF;
  /** esfera envolvente p/ otimização */
  center: Vec3;
  radius: number;
}

export interface BoneDef {
  name: string;
  parent: string | null;
  /** posição da junta em espaço do modelo (bind pose) */
  pos: Vec3;
  /** ponto final do segmento do osso (para cálculo de pesos) */
  tail: Vec3;
}

// ---------------------------------------------------------------------------
// Juntas
// ---------------------------------------------------------------------------
const ARM_ANGLE = (45 * Math.PI) / 180; // pose em A
const armDir = (side: 1 | -1): Vec3 => norm(v3(side * Math.sin(ARM_ANGLE), -Math.cos(ARM_ANGLE), 0));

const UPPER_ARM = 0.29;
const FOREARM = 0.255;
const HAND = 0.185;

function sideJoints(side: 1 | -1) {
  const s = side;
  const d = armDir(side);
  const clav = v3(0.03 * s, 1.445, -0.005);
  const shoulder = v3(0.178 * s, 1.432, -0.012);
  const elbow = add(shoulder, scale(d, UPPER_ARM));
  const wrist = add(elbow, scale(d, FOREARM));
  const handEnd = add(wrist, scale(d, HAND));
  const hip = v3(0.092 * s, 0.94, 0.0);
  const knee = v3(0.104 * s, 0.515, 0.012);
  const ankle = v3(0.114 * s, 0.088, -0.028);
  const toe = v3(0.12 * s, 0.032, 0.112);
  const toeEnd = v3(0.122 * s, 0.03, 0.18);
  return { clav, shoulder, elbow, wrist, handEnd, hip, knee, ankle, toe, toeEnd, d };
}

export const L = sideJoints(1);
export const R = sideJoints(-1);

export const J = {
  hips: v3(0, 0.98, 0),
  spine: v3(0, 1.075, 0.004),
  spine1: v3(0, 1.19, 0.006),
  spine2: v3(0, 1.315, 0.0),
  neck: v3(0, 1.49, -0.012),
  head: v3(0, 1.585, 0.0),
  headTop: v3(0, 1.775, 0.0),
};

export const BONES: BoneDef[] = [
  { name: 'Hips', parent: null, pos: J.hips, tail: J.spine },
  { name: 'Spine', parent: 'Hips', pos: J.spine, tail: J.spine1 },
  { name: 'Spine1', parent: 'Spine', pos: J.spine1, tail: J.spine2 },
  { name: 'Spine2', parent: 'Spine1', pos: J.spine2, tail: J.neck },
  { name: 'Neck', parent: 'Spine2', pos: J.neck, tail: J.head },
  { name: 'Head', parent: 'Neck', pos: J.head, tail: J.headTop },
  ...(['Left', 'Right'] as const).flatMap((side) => {
    const S = side === 'Left' ? L : R;
    return [
      { name: `${side}Shoulder`, parent: 'Spine2', pos: S.clav, tail: S.shoulder },
      { name: `${side}Arm`, parent: `${side}Shoulder`, pos: S.shoulder, tail: S.elbow },
      { name: `${side}ForeArm`, parent: `${side}Arm`, pos: S.elbow, tail: S.wrist },
      { name: `${side}Hand`, parent: `${side}ForeArm`, pos: S.wrist, tail: S.handEnd },
      { name: `${side}UpLeg`, parent: 'Hips', pos: S.hip, tail: S.knee },
      { name: `${side}Leg`, parent: `${side}UpLeg`, pos: S.knee, tail: S.ankle },
      { name: `${side}Foot`, parent: `${side}Leg`, pos: S.ankle, tail: S.toe },
      { name: `${side}ToeBase`, parent: `${side}Foot`, pos: S.toe, tail: S.toeEnd },
    ] as BoneDef[];
  }),
];

/** Pontos da sola (em espaço do modelo) usados para apoiar os pés no chão nas animações. */
export const SOLE_POINTS = {
  LeftFoot: [v3(L.ankle[0], 0, -0.085)],
  LeftToeBase: [v3(L.toe[0], 0, L.toe[2]), v3(L.toeEnd[0], 0.004, L.toeEnd[2] + 0.02)],
  RightFoot: [v3(R.ankle[0], 0, -0.085)],
  RightToeBase: [v3(R.toe[0], 0, R.toe[2]), v3(R.toeEnd[0], 0.004, R.toeEnd[2] + 0.02)],
};

// ---------------------------------------------------------------------------
// Pesos de skin: ossos permitidos por zona (multiplicador de distância).
// ---------------------------------------------------------------------------
export function allowedBones(zone: Zone): Record<string, number> {
  switch (zone) {
    case 'head': return { Head: 1, Neck: 2.2 };
    case 'neck': return { Neck: 1, Head: 1.25, Spine2: 1.35 };
    case 'torso': return {
      Spine: 1, Spine1: 1, Spine2: 1, Hips: 1.1, Neck: 1.6,
      LeftShoulder: 1.25, RightShoulder: 1.25, LeftArm: 2.4, RightArm: 2.4,
    };
    case 'pelvis': return { Hips: 1, Spine: 1.15, LeftUpLeg: 1.15, RightUpLeg: 1.15 };
    case 'shoulderL': return { Spine2: 1.25, LeftShoulder: 1, LeftArm: 1 };
    case 'shoulderR': return { Spine2: 1.25, RightShoulder: 1, RightArm: 1 };
    case 'armL': return { LeftArm: 1, LeftForeArm: 1, LeftHand: 1.15, LeftShoulder: 1.8 };
    case 'armR': return { RightArm: 1, RightForeArm: 1, RightHand: 1.15, RightShoulder: 1.8 };
    case 'handL': return { LeftHand: 1, LeftForeArm: 1.5 };
    case 'handR': return { RightHand: 1, RightForeArm: 1.5 };
    case 'legL': return { LeftUpLeg: 1, LeftLeg: 1, LeftFoot: 1.3, Hips: 1.7 };
    case 'legR': return { RightUpLeg: 1, RightLeg: 1, RightFoot: 1.3, Hips: 1.7 };
    case 'footL': return { LeftFoot: 1, LeftToeBase: 1, LeftLeg: 1.8 };
    case 'footR': return { RightFoot: 1, RightToeBase: 1, RightLeg: 1.8 };
  }
}

// ---------------------------------------------------------------------------
// Corpo
// ---------------------------------------------------------------------------
function part(
  name: string, zone: Zone, material: MaterialName, op: Part['op'], k: number,
  sdf: SDF, center: Vec3, radius: number,
): Part {
  return { name, zone, material, op, k, sdf, center, radius };
}

function limbParts(side: 1 | -1): Part[] {
  const S = side === 1 ? L : R;
  const sx = side === 1 ? 'L' : 'R';
  const arm = `arm${sx}` as Zone;
  const hand = `hand${sx}` as Zone;
  const leg = `leg${sx}` as Zone;
  const foot = `foot${sx}` as Zone;
  const shoulderZ = `shoulder${sx}` as Zone;
  const d = S.d;
  const fwd: Vec3 = [0, 0, 1];
  const lat = norm(cross(fwd, d)); // perpendicular ao braço no plano frontal
  const parts: Part[] = [];

  // Ombro / deltoide (camiseta)
  parts.push(part(`deltoid${sx}`, shoulderZ, 'Shirt', 'add', 0.05,
    ellipsoid(add(S.shoulder, v3(0.012 * side, -0.01, 0)), v3(0.06, 0.058, 0.062)), S.shoulder, 0.09));

  // Braço (pele) + bíceps/tríceps
  const midUpper = lerp3(S.shoulder, S.elbow, 0.45);
  parts.push(part(`upperArm${sx}`, arm, 'Skin', 'add', 0.02,
    roundCone(S.shoulder, S.elbow, 0.047, 0.036), midUpper, 0.2));
  parts.push(part(`biceps${sx}`, arm, 'Skin', 'add', 0.02,
    orientedEllipsoid(add(lerp3(S.shoulder, S.elbow, 0.5), scale(lat, -0.004)), d, lat, fwd, v3(0.095, 0.039, 0.043)),
    midUpper, 0.13));
  // Manga da camiseta (união rígida -> borda visível)
  const sleeveEnd = lerp3(S.shoulder, S.elbow, 0.48);
  parts.push(part(`sleeve${sx}`, arm, 'Shirt', 'hard', 0,
    roundCone(add(S.shoulder, scale(d, 0.01)), sleeveEnd, 0.062, 0.05), midUpper, 0.18));

  // Antebraço
  parts.push(part(`forearm${sx}`, arm, 'Skin', 'add', 0.02,
    roundCone(S.elbow, S.wrist, 0.037, 0.026), lerp3(S.elbow, S.wrist, 0.5), 0.17));
  parts.push(part(`forearmMuscle${sx}`, arm, 'Skin', 'add', 0.025,
    orientedEllipsoid(lerp3(S.elbow, S.wrist, 0.3), d, lat, fwd, v3(0.085, 0.037, 0.04)),
    lerp3(S.elbow, S.wrist, 0.3), 0.11));

  // Mão: palma voltada para a coxa (-lat), polegar para frente, dedos curvados.
  const palmSide = scale(lat, -1);
  const palmC = add(add(S.wrist, scale(d, 0.052)), scale(lat, 0.002));
  parts.push(part(`palm${sx}`, hand, 'Skin', 'add', 0.014,
    roundBox(palmC, d, fwd, lat, v3(0.047, 0.039, 0.0135), 0.012), palmC, 0.08));
  const knuckle = add(S.wrist, scale(d, 0.098));
  const bend = (deg: number): Vec3 => {
    const a = (deg * Math.PI) / 180;
    return norm(add(scale(d, Math.cos(a)), scale(palmSide, Math.sin(a))));
  };
  const f1 = bend(18), f2 = bend(48);
  const mid = add(knuckle, scale(f1, 0.046));
  const tip = add(mid, scale(f2, 0.04));
  const seg = (a: Vec3, b: Vec3, hw: number, ht: number): SDF => {
    const u = norm(sub(b, a));
    const w = norm(cross(u, fwd));
    const v = cross(w, u);
    return roundBox(lerp3(a, b, 0.5), u, v, w, v3(Math.hypot(...sub(b, a)) / 2 + 0.006, hw, ht), Math.min(hw, ht) * 0.95);
  };
  parts.push(part(`fingers1${sx}`, hand, 'Skin', 'add', 0.01, seg(knuckle, mid, 0.037, 0.0105), mid, 0.07));
  parts.push(part(`fingers2${sx}`, hand, 'Skin', 'add', 0.01, seg(mid, tip, 0.034, 0.009), tip, 0.06));
  const thumbA = add(add(S.wrist, scale(d, 0.03)), add(scale(fwd, 0.028), scale(palmSide, 0.006)));
  const thumbB = add(thumbA, add(scale(d, 0.055), add(scale(fwd, 0.016), scale(palmSide, 0.02))));
  parts.push(part(`thumb${sx}`, hand, 'Skin', 'add', 0.012, roundCone(thumbA, thumbB, 0.0125, 0.009), thumbA, 0.09));

  // Pernas (calça)
  parts.push(part(`thigh${sx}`, leg, 'Pants', 'add', 0.02,
    roundCone(add(S.hip, v3(0.002 * side, 0.02, 0)), S.knee, 0.081, 0.054), lerp3(S.hip, S.knee, 0.5), 0.3));
  parts.push(part(`quad${sx}`, leg, 'Pants', 'add', 0.03,
    ellipsoid(add(lerp3(S.hip, S.knee, 0.45), v3(0.004 * side, 0, 0.02)), v3(0.07, 0.17, 0.068)),
    lerp3(S.hip, S.knee, 0.45), 0.2));
  parts.push(part(`knee${sx}`, leg, 'Pants', 'add', 0.02,
    sphere(add(S.knee, v3(0, 0, 0.012)), 0.052), S.knee, 0.07));
  parts.push(part(`shin${sx}`, leg, 'Pants', 'add', 0.02,
    roundCone(S.knee, add(S.ankle, v3(0, 0.03, 0.01)), 0.052, 0.04), lerp3(S.knee, S.ankle, 0.5), 0.27));
  parts.push(part(`calf${sx}`, leg, 'Pants', 'add', 0.03,
    ellipsoid(add(lerp3(S.knee, S.ankle, 0.3), v3(0.002 * side, 0, -0.022)), v3(0.05, 0.12, 0.052)),
    lerp3(S.knee, S.ankle, 0.3), 0.14));
  // Barra da calça
  parts.push(part(`cuff${sx}`, leg, 'Pants', 'hard', 0,
    roundCone(add(S.ankle, v3(0, 0.075, 0.012)), add(S.ankle, v3(0, 0.035, 0.008)), 0.05, 0.051),
    add(S.ankle, v3(0, 0.05, 0)), 0.08));

  // Tênis
  const shoeC = v3(S.ankle[0] + 0.002 * side, 0.052, 0.045);
  parts.push(part(`shoe${sx}`, foot, 'Shoes', 'add', 0.03,
    roundBox(shoeC, v3(1, 0, 0), v3(0, 1, 0), v3(0, 0, 1), v3(0.046, 0.036, 0.13), 0.034), shoeC, 0.16));
  parts.push(part(`shoeAnkle${sx}`, foot, 'Shoes', 'add', 0.035,
    capsule(add(S.ankle, v3(0, 0.0, -0.01)), add(S.ankle, v3(0, 0.035, -0.008)), 0.047), S.ankle, 0.09));
  parts.push(part(`shoeToe${sx}`, foot, 'Shoes', 'add', 0.03,
    ellipsoid(v3(S.toe[0], 0.04, 0.125), v3(0.046, 0.032, 0.06)), S.toe, 0.09));
  const soleC = v3(S.ankle[0] + 0.002 * side, 0.0115, 0.048);
  parts.push(part(`sole${sx}`, foot, 'Sole', 'hard', 0,
    roundBox(soleC, v3(1, 0, 0), v3(0, 1, 0), v3(0, 0, 1), v3(0.047, 0.011, 0.135), 0.01), soleC, 0.16));

  return parts;
}

export function bodyParts(): Part[] {
  const P: Part[] = [];
  // Tronco ------------------------------------------------------------------
  P.push(part('pelvis', 'pelvis', 'Pants', 'add', 0.04,
    ellipsoid(v3(0, 0.965, -0.008), v3(0.148, 0.105, 0.106)), v3(0, 0.965, 0), 0.2));
  P.push(part('gluteL', 'pelvis', 'Pants', 'add', 0.04,
    ellipsoid(v3(0.068, 0.905, -0.058), v3(0.083, 0.09, 0.075)), v3(0.07, 0.9, -0.06), 0.11));
  P.push(part('gluteR', 'pelvis', 'Pants', 'add', 0.04,
    ellipsoid(v3(-0.068, 0.905, -0.058), v3(0.083, 0.09, 0.075)), v3(-0.07, 0.9, -0.06), 0.11));
  P.push(part('abdomen', 'torso', 'Shirt', 'add', 0.06,
    ellipsoid(v3(0, 1.125, -0.004), v3(0.142, 0.14, 0.092)), v3(0, 1.12, 0), 0.17));
  // Barra da camiseta: casca um pouco maior que o abdômen, recortada abaixo da cintura
  const abd = ellipsoid(v3(0, 1.105, -0.006), v3(0.15, 0.155, 0.096));
  P.push(part('shirtHem', 'torso', 'Shirt', 'hard', 0,
    (x, y, z) => Math.max(abd(x, y, z), 0.995 - y), v3(0, 1.1, 0), 0.2));
  P.push(part('chest', 'torso', 'Shirt', 'add', 0.06,
    ellipsoid(v3(0, 1.31, -0.004), v3(0.176, 0.155, 0.106)), v3(0, 1.3, 0), 0.19));
  P.push(part('pecs', 'torso', 'Shirt', 'add', 0.05,
    ellipsoid(v3(0, 1.345, 0.018), v3(0.148, 0.075, 0.088)), v3(0, 1.335, 0.03), 0.16));
  P.push(part('upperBack', 'torso', 'Shirt', 'add', 0.05,
    ellipsoid(v3(0, 1.36, -0.03), v3(0.16, 0.1, 0.09)), v3(0, 1.36, -0.03), 0.17));
  P.push(part('trapezius', 'torso', 'Shirt', 'add', 0.06,
    capsule(v3(-0.13, 1.425, -0.02), v3(0.13, 1.425, -0.02), 0.06), v3(0, 1.425, -0.02), 0.2));
  P.push(part('collar', 'torso', 'Shirt', 'hard', 0,
    torusY(v3(0, 1.462, -0.006), 0.058, 0.011, 1.0), v3(0, 1.462, 0), 0.08));

  // Pescoço e cabeça ---------------------------------------------------------
  P.push(part('neck', 'neck', 'Skin', 'add', 0.03,
    capsule(v3(0, 1.43, -0.012), v3(0, 1.6, -0.004), 0.05), v3(0, 1.52, 0), 0.13));
  P.push(part('cranium', 'head', 'Skin', 'add', 0.03,
    ellipsoid(v3(0, 1.672, -0.008), v3(0.078, 0.098, 0.099)), v3(0, 1.672, 0), 0.12));
  P.push(part('face', 'head', 'Skin', 'add', 0.035,
    ellipsoid(v3(0, 1.628, 0.026), v3(0.063, 0.078, 0.07)), v3(0, 1.628, 0.03), 0.1));
  P.push(part('jaw', 'head', 'Skin', 'add', 0.03,
    roundCone(v3(0, 1.608, 0.016), v3(0, 1.557, 0.058), 0.054, 0.02), v3(0, 1.58, 0.04), 0.09));
  P.push(part('cheekL', 'head', 'Skin', 'add', 0.028,
    sphere(v3(0.043, 1.64, 0.062), 0.021), v3(0.043, 1.64, 0.062), 0.03));
  P.push(part('cheekR', 'head', 'Skin', 'add', 0.028,
    sphere(v3(-0.043, 1.64, 0.062), 0.021), v3(-0.043, 1.64, 0.062), 0.03));
  P.push(part('brow', 'head', 'Skin', 'add', 0.022,
    ellipsoid(v3(0, 1.681, 0.08), v3(0.06, 0.016, 0.019)), v3(0, 1.681, 0.08), 0.07));
  P.push(part('nose', 'head', 'Skin', 'add', 0.01,
    roundCone(v3(0, 1.67, 0.091), v3(0, 1.628, 0.114), 0.0078, 0.0118), v3(0, 1.648, 0.1), 0.04));
  P.push(part('noseWings', 'head', 'Skin', 'add', 0.01,
    ellipsoid(v3(0, 1.626, 0.103), v3(0.0175, 0.0092, 0.0105)), v3(0, 1.626, 0.103), 0.03));
  P.push(part('upperLip', 'head', 'Skin', 'add', 0.008,
    ellipsoid(v3(0, 1.6, 0.0935), v3(0.0215, 0.0052, 0.0072)), v3(0, 1.6, 0.0935), 0.03));
  P.push(part('lowerLip', 'head', 'Skin', 'add', 0.008,
    ellipsoid(v3(0, 1.5895, 0.0915), v3(0.0195, 0.0062, 0.0072)), v3(0, 1.5895, 0.0915), 0.03));
  P.push(part('mouthLine', 'head', 'Lips', 'sub', 0.003,
    capsule(v3(-0.019, 1.5945, 0.101), v3(0.019, 1.5945, 0.101), 0.0016), v3(0, 1.5945, 0.1), 0.03));
  P.push(part('chin', 'head', 'Skin', 'add', 0.02,
    sphere(v3(0, 1.563, 0.074), 0.019), v3(0, 1.563, 0.074), 0.03));
  for (const s of [1, -1] as const) {
    P.push(part(`ear${s > 0 ? 'L' : 'R'}`, 'head', 'Skin', 'add', 0.008,
      orientedEllipsoid(v3(0.078 * s, 1.645, -0.005), norm(v3(s, 0, -0.35)), v3(0, 1, 0), norm(cross(norm(v3(s, 0, -0.35)), v3(0, 1, 0))),
        v3(0.009, 0.03, 0.019)),
      v3(0.078 * s, 1.645, -0.005), 0.04));
    // órbitas oculares
    // abertura das pálpebras (amêndoa) — o globo ocular fica atrás
    P.push(part(`socket${s > 0 ? 'L' : 'R'}`, 'head', 'Skin', 'sub', 0.006,
      orientedEllipsoid(v3(0.031 * s, 1.6555, 0.0905), norm(v3(1, 0.06 * s, 0)), norm(v3(-0.06 * s, 1, 0)), v3(0, 0, 1),
        v3(0.0148, 0.0068, 0.0135)),
      v3(0.031 * s, 1.6555, 0.09), 0.02));
  }

  P.push(...limbParts(1), ...limbParts(-1));
  return P;
}

/** Olhos (malhas separadas, presas ao osso Head). */
export const EYES = [1, -1].map((s) => ({
  center: v3(0.031 * s, 1.6555, 0.0752),
  radius: 0.0122,
}));

/** Cabelo + sobrancelhas (malha separada, presa ao osso Head). */
const smaxLocal = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
};

/** Distância às regiões de lábio — usada para tingir a cor dos vértices sem serrilhado. */
export function lipsSDF(): SDF {
  const up = ellipsoid(v3(0, 1.6, 0.0935), v3(0.0215, 0.0052, 0.0072));
  const lo = ellipsoid(v3(0, 1.5895, 0.0915), v3(0.0195, 0.0062, 0.0072));
  return (x, y, z) => Math.min(up(x, y, z), lo(x, y, z));
}

/**
 * Sobrancelhas: pontos projetados na superfície do rosto (surfaceZ) para ficarem
 * sempre "coladas" na pele, independentemente da forma da testa.
 */
export function browsSDF(surfaceZ: (x: number, y: number) => number): SDF {
  const parts: SDF[] = [];
  for (const s of [1, -1]) {
    const pts: Vec3[] = [];
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const x = s * (0.012 + 0.038 * t);
      const y = 1.6795 + 0.006 * Math.sin(Math.PI * Math.min(1, t * 1.3)) - 0.002 * t;
      pts.push(v3(x, y, surfaceZ(x, y) - 0.0009));
    }
    for (let i = 0; i < 4; i++) parts.push(roundCone(pts[i], pts[i + 1], 0.0034 - i * 0.0004, 0.003 - i * 0.0004));
  }
  return (x, y, z) => {
    let d = 1e9;
    for (const p of parts) d = Math.min(d, p(x, y, z));
    return d;
  };
}

export function hairSDF(noise: (x: number, y: number, z: number) => number, brows: SDF): SDF {
  const cranium = ellipsoid(v3(0, 1.674, -0.009), v3(0.079, 0.099, 0.1));
  const ss = (a: number, b: number, x: number) => {
    const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
    return t * t * (3 - 2 * t);
  };
  return (x, y, z) => {
    // espessura: curto nas laterais/nuca, mais volume no topo e topete frontal
    const top = ss(1.655, 1.75, y);
    const front = ss(-0.02, 0.07, z);
    // linha do cabelo: mais alta na testa, entradas suaves, desce na nuca
    const fz = Math.min(Math.max(z, 0) / 0.095, 1);
    // contorno arredondado na testa (mais baixo nas têmporas)
    const ax = Math.min(Math.abs(x) / 0.07, 1);
    const hairline = 1.628 + (0.07 - 0.03 * ax * ax) * Math.pow(fz, 1.4) - 0.032 * Math.min(Math.max(-z, 0) / 0.1, 1);
    // o cabelo afina perto da linha do couro cabeludo (sem efeito "capacete")
    const edge = 0.35 + 0.65 * ss(0.0, 0.03, y - hairline);
    const thick = (0.0045 + 0.013 * top + 0.009 * top * front - 0.003 * ss(0.05, 0.075, Math.abs(x)) * (1 - top)) * edge;
    let d = cranium(x, y, z) - thick;
    // sem cabelo sobre as orelhas
    const ear = Math.abs(x) > 0.064 && z > -0.035 && z < 0.03 ? 0.022 * ss(1.6, 1.66, 1.69 - y) : 0;
    d = smaxLocal(d, hairline + ear - y, 0.004);
    // mechas penteadas para trás (ruído alongado em Z)
    d += 0.0011 * noise(x * 150, y * 60, z * 14) + 0.0004 * noise(x * 380, y * 250, z * 40);
    return Math.min(d, brows(x, y, z));
  };
}

export { sub };
