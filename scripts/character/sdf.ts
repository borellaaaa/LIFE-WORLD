/**
 * Primitivas SDF (signed distance functions) usadas para "esculpir" o personagem.
 * Todas as funções recebem coordenadas em metros e retornam a distância assinada
 * (negativa dentro da forma).
 */

export type Vec3 = [number, number, number];
export type SDF = (x: number, y: number, z: number) => number;

export const v3 = (x: number, y: number, z: number): Vec3 => [x, y, z];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: Vec3): Vec3 => scale(a, 1 / (len(a) || 1));
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

export function smin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

export function smax(a: number, b: number, k: number): number {
  return -smin(-a, -b, k);
}

export function sphere(c: Vec3, r: number): SDF {
  const [cx, cy, cz] = c;
  return (x, y, z) => Math.hypot(x - cx, y - cy, z - cz) - r;
}

/** Elipsoide (aproximação de Inigo Quilez — boa o bastante para malhas suaves). */
export function ellipsoid(c: Vec3, r: Vec3): SDF {
  const [cx, cy, cz] = c;
  const [rx, ry, rz] = r;
  return (x, y, z) => {
    const px = x - cx, py = y - cy, pz = z - cz;
    const k0 = Math.hypot(px / rx, py / ry, pz / rz);
    const k1 = Math.hypot(px / (rx * rx), py / (ry * ry), pz / (rz * rz));
    if (k1 < 1e-9) return -Math.min(rx, ry, rz);
    return (k0 * (k0 - 1)) / k1;
  };
}

/** Elipsoide orientado por uma base ortonormal (u, v, w). */
export function orientedEllipsoid(c: Vec3, u: Vec3, v: Vec3, w: Vec3, r: Vec3): SDF {
  const base = ellipsoid([0, 0, 0], r);
  return (x, y, z) => {
    const px = x - c[0], py = y - c[1], pz = z - c[2];
    return base(
      px * u[0] + py * u[1] + pz * u[2],
      px * v[0] + py * v[1] + pz * v[2],
      px * w[0] + py * w[1] + pz * w[2],
    );
  };
}

export function capsule(a: Vec3, b: Vec3, r: number): SDF {
  const ba = sub(b, a);
  const bb = dot(ba, ba);
  return (x, y, z) => {
    const pax = x - a[0], pay = y - a[1], paz = z - a[2];
    let h = (pax * ba[0] + pay * ba[1] + paz * ba[2]) / bb;
    h = h < 0 ? 0 : h > 1 ? 1 : h;
    return Math.hypot(pax - ba[0] * h, pay - ba[1] * h, paz - ba[2] * h) - r;
  };
}

/** Cone arredondado entre dois pontos com raios diferentes (IQ). */
export function roundCone(a: Vec3, b: Vec3, r1: number, r2: number): SDF {
  const ba = sub(b, a);
  const l2 = dot(ba, ba);
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  return (x, y, z) => {
    const pax = x - a[0], pay = y - a[1], paz = z - a[2];
    const yy = pax * ba[0] + pay * ba[1] + paz * ba[2];
    const zz = yy - l2;
    const qx = pax * l2 - ba[0] * yy;
    const qy = pay * l2 - ba[1] * yy;
    const qz = paz * l2 - ba[2] * yy;
    const x2 = qx * qx + qy * qy + qz * qz;
    const y2 = yy * yy * l2;
    const z2 = zz * zz * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
  };
}

/** Caixa arredondada orientada: centro c, eixos u/v/w (ortonormais), meia-extensão h, raio r. */
export function roundBox(c: Vec3, u: Vec3, v: Vec3, w: Vec3, h: Vec3, r: number): SDF {
  return (x, y, z) => {
    const px = x - c[0], py = y - c[1], pz = z - c[2];
    const lx = Math.abs(px * u[0] + py * u[1] + pz * u[2]) - h[0] + r;
    const ly = Math.abs(px * v[0] + py * v[1] + pz * v[2]) - h[1] + r;
    const lz = Math.abs(px * w[0] + py * w[1] + pz * w[2]) - h[2] + r;
    const ox = Math.max(lx, 0), oy = Math.max(ly, 0), oz = Math.max(lz, 0);
    return Math.hypot(ox, oy, oz) + Math.min(Math.max(lx, ly, lz), 0) - r;
  };
}

/** Toro horizontal (eixo Y) com raio maior R e menor r, achatado em Z por sz. */
export function torusY(c: Vec3, R: number, r: number, sz = 1): SDF {
  return (x, y, z) => {
    const px = x - c[0], py = y - c[1], pz = (z - c[2]) / sz;
    const q = Math.hypot(px, pz) - R;
    return Math.hypot(q, py) - r;
  };
}

// ---------------------------------------------------------------------------
// Ruído determinístico (value noise 3D) — usado para textura do cabelo.
// ---------------------------------------------------------------------------
function hash3(i: number, j: number, k: number): number {
  let h = (i * 374761393 + j * 668265263 + k * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 100000) / 100000;
}

export function valueNoise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c000 = hash3(xi, yi, zi), c100 = hash3(xi + 1, yi, zi);
  const c010 = hash3(xi, yi + 1, zi), c110 = hash3(xi + 1, yi + 1, zi);
  const c001 = hash3(xi, yi, zi + 1), c101 = hash3(xi + 1, yi, zi + 1);
  const c011 = hash3(xi, yi + 1, zi + 1), c111 = hash3(xi + 1, yi + 1, zi + 1);
  return l(
    l(l(c000, c100, u), l(c010, c110, u), v),
    l(l(c001, c101, u), l(c011, c111, u), v),
    w,
  ) * 2 - 1;
}

export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};
