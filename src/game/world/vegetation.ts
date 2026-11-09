/**
 * Vegetação procedural: árvores (instanciadas), arbustos, sebes e grama com vento.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Materials } from './materials';
import { rand } from './textures';
import { Physics, G } from '../physics/Physics';

// ---------------------------------------------------------------------------
// Ruído 3D simples (para deformar copas)
// ---------------------------------------------------------------------------
function h3(x: number, y: number, z: number) {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise3(x: number, y: number, z: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const s = (t: number) => t * t * (3 - 2 * t);
  const u = s(xf), v = s(yf), w = s(zf);
  const L = (a: number, b: number, t: number) => a + (b - a) * t;
  return L(
    L(L(h3(xi, yi, zi), h3(xi + 1, yi, zi), u), L(h3(xi, yi + 1, zi), h3(xi + 1, yi + 1, zi), u), v),
    L(L(h3(xi, yi, zi + 1), h3(xi + 1, yi, zi + 1), u), L(h3(xi, yi + 1, zi + 1), h3(xi + 1, yi + 1, zi + 1), u), v),
    w,
  );
}

// ---------------------------------------------------------------------------
// Vento compartilhado (onBeforeCompile)
// ---------------------------------------------------------------------------
export const windUniforms = { uTime: { value: 0 }, uWind: { value: 1 } };

function addWind(mat: THREE.Material, amount: number, mode: 'tree' | 'grass') {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWind = windUniforms.uWind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;\nuniform float uWind;`)
      .replace(
        '#include <begin_vertex>',
        mode === 'tree'
          ? `#include <begin_vertex>
            #ifdef USE_INSTANCING
              vec3 ip = instanceMatrix[3].xyz;
            #else
              vec3 ip = vec3(0.0);
            #endif
            float hw = max(position.y - 1.5, 0.0);
            float ph = uTime * 1.3 + ip.x * 0.21 + ip.z * 0.17;
            transformed.x += sin(ph) * ${amount.toFixed(3)} * hw * uWind;
            transformed.z += cos(ph * 0.8 + 1.3) * ${(amount * 0.6).toFixed(3)} * hw * uWind;
            transformed += normal * sin(uTime * 4.0 + position.x * 3.0 + position.y * 2.0) * 0.015 * uWind;`
          : `#include <begin_vertex>
            #ifdef USE_INSTANCING
              vec3 ip = instanceMatrix[3].xyz;
            #else
              vec3 ip = vec3(0.0);
            #endif
            float k = position.y * position.y;
            float ph = uTime * 1.9 + ip.x * 0.35 + ip.z * 0.27;
            float gust = 0.6 + 0.4 * sin(uTime * 0.37 + ip.x * 0.05);
            transformed.x += sin(ph) * ${amount.toFixed(3)} * k * gust * uWind;
            transformed.z += cos(ph * 1.13) * ${(amount * 0.7).toFixed(3)} * k * gust * uWind;`,
      );
  };
  mat.customProgramCacheKey = () => `wind-${mode}-${amount}`;
}

// ---------------------------------------------------------------------------
// Folhas: textura RGBA desenhada em canvas + cartões recortados (alphaTest)
// ---------------------------------------------------------------------------
let leafTex: THREE.Texture | null = null;
function leafTexture() {
  if (leafTex) return leafTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  const r = rand(4242);
  const greens = ['#3f6b2a', '#4f7d31', '#5e8c38', '#355d24', '#6f9a43', '#2d5220'];
  for (let i = 0; i < 70; i++) {
    const x = 128 + (r() - 0.5) * 200, y = 128 + (r() - 0.5) * 200;
    if (Math.hypot(x - 128, y - 128) > 108) continue;
    const a = r() * Math.PI * 2, L = 18 + r() * 16, W = L * (0.38 + r() * 0.14);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = greens[Math.floor(r() * greens.length)];
    ctx.beginPath();
    ctx.moveTo(-L / 2, 0);
    ctx.quadraticCurveTo(0, -W, L / 2, 0);
    ctx.quadraticCurveTo(0, W, -L / 2, 0);
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,40,10,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-L / 2, 0);
    ctx.lineTo(L / 2, 0);
    ctx.stroke();
    ctx.restore();
  }
  leafTex = new THREE.CanvasTexture(c);
  leafTex.colorSpace = THREE.SRGBColorSpace;
  leafTex.anisotropy = 4;
  return leafTex;
}

function leafCards(blobs: THREE.BufferGeometry[], center: THREE.Vector3, seed: number, count: number, size: number) {
  const r = rand(seed);
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [];
  const v = new THREE.Vector3(), n = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
  for (let i = 0; i < count; i++) {
    const g = blobs[Math.floor(r() * blobs.length)];
    const P = g.getAttribute('position') as THREE.BufferAttribute;
    const k = Math.floor(r() * P.count);
    v.fromBufferAttribute(P, k);
    n.copy(v).sub(center).normalize();
    v.addScaledVector(n, 0.05 + r() * 0.2);
    // base aleatória do cartão
    a.set(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
    b.crossVectors(n, a).normalize();
    a.crossVectors(b, n).normalize();
    const s = size * (0.75 + r() * 0.5);
    const up = THREE.MathUtils.clamp((v.y - center.y + 2) / 4, 0, 1);
    const shade = 0.62 + 0.38 * up + (r() - 0.5) * 0.12;
    for (const [cu, cv] of corners) {
      pos.push(v.x + (a.x * cu + b.x * cv) * s * 0.5, v.y + (a.y * cu + b.y * cv) * s * 0.5, v.z + (a.z * cu + b.z * cv) * s * 0.5);
      nor.push(n.x, n.y, n.z);
      uv.push(cu * 0.5 + 0.5, cv * 0.5 + 0.5);
      col.push(shade, shade, shade * 0.95);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

// ---------------------------------------------------------------------------
// Árvores
// ---------------------------------------------------------------------------
interface TreeVariant {
  trunk: THREE.BufferGeometry;
  foliage: THREE.BufferGeometry;
  leaves: THREE.BufferGeometry;
  trunkRadius: number;
}

function blob(radius: number, cx: number, cy: number, cz: number, treeCenter: THREE.Vector3, seed: number, detail = 2) {
  const g = new THREE.IcosahedronGeometry(radius, detail);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const uv = new Float32Array(pos.count * 2);
  const v = new THREE.Vector3(), n = new THREE.Vector3(), tn = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    n.copy(v).normalize();
    const d = noise3(n.x * 2.2 + seed, n.y * 2.2, n.z * 2.2) * 0.35 + noise3(n.x * 6 + seed, n.y * 6, n.z * 6) * 0.12;
    v.multiplyScalar(0.82 + d);
    v.y *= 0.85;
    v.x += cx; v.y += cy; v.z += cz;
    pos.setXYZ(i, v.x, v.y, v.z);
    // normal suavizada a partir do centro da árvore (copas "macias")
    tn.copy(v).sub(treeCenter).normalize();
    n.lerp(tn, 0.65).normalize();
    nrm.setXYZ(i, n.x, n.y, n.z);
    const up = THREE.MathUtils.clamp((v.y - (treeCenter.y - radius * 1.5)) / (radius * 3), 0, 1);
    const shade = 0.55 + 0.45 * up;
    const hue = noise3(v.x * 0.7 + seed, v.y * 0.7, v.z * 0.7);
    col.set([shade * (0.92 + hue * 0.16), shade * (0.96 + hue * 0.08), shade * 0.9], i * 3);
    uv[i * 2] = (v.x + v.z) * 0.8;
    uv[i * 2 + 1] = v.y * 0.8;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

function makeTreeVariant(seed: number, kind: 'round' | 'tall' | 'wide'): TreeVariant {
  const r = rand(seed);
  const H = kind === 'tall' ? 5.6 : kind === 'wide' ? 4.2 : 4.6;
  const trunkR = kind === 'wide' ? 0.2 : 0.16;
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(trunkR * 0.6, trunkR, H, 9, 6);
  trunk.translate(0, H / 2, 0);
  const p = trunk.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    p.setX(i, p.getX(i) + Math.sin(y * 0.9 + seed) * 0.08 * (y / H));
    p.setZ(i, p.getZ(i) + Math.cos(y * 0.7 + seed) * 0.06 * (y / H));
  }
  trunk.computeVertexNormals();
  parts.push(trunk.toNonIndexed());
  // galhos principais
  const nb = 4 + Math.floor(r() * 2);
  for (let i = 0; i < nb; i++) {
    const len = 1.2 + r() * 0.9;
    const br = new THREE.CylinderGeometry(0.035, 0.07, len, 6, 1);
    br.translate(0, len / 2, 0);
    br.rotateZ(0.6 + r() * 0.5);
    br.rotateY((i / nb) * Math.PI * 2 + r() * 0.5);
    br.translate(0, H * (0.55 + r() * 0.25), 0);
    parts.push(br.toNonIndexed());
  }
  const trunkGeo = mergeGeometries(parts)!;

  const center = new THREE.Vector3(0, H + (kind === 'tall' ? 0.6 : 0.2), 0);
  const blobs: THREE.BufferGeometry[] = [];
  const nBlobs = kind === 'wide' ? 9 : 7;
  for (let i = 0; i < nBlobs; i++) {
    const a = (i / nBlobs) * Math.PI * 2 + r();
    const rad = kind === 'wide' ? 1.5 + r() * 0.8 : kind === 'tall' ? 0.9 + r() * 0.5 : 1.1 + r() * 0.6;
    const spread = kind === 'wide' ? 1.7 : kind === 'tall' ? 0.8 : 1.15;
    const y = center.y + (r() - 0.4) * (kind === 'tall' ? 2.4 : 1.3);
    blobs.push(blob(rad * 1.05, Math.cos(a) * spread * r(), y, Math.sin(a) * spread * r(), center, seed + i * 7.1));
  }
  blobs.push(blob(kind === 'wide' ? 2.0 : 1.5, 0, center.y + 0.5, 0, center, seed + 99));
  const leaves = leafCards(blobs, center, seed + 5, kind === 'wide' ? 900 : 700, kind === 'tall' ? 0.7 : 0.85);
  // o núcleo fica um pouco menor e mais escuro: dá volume por trás das folhas
  for (const g of blobs) {
    const P = g.getAttribute('position') as THREE.BufferAttribute;
    const C = g.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < P.count; i++) {
      P.setXYZ(i, center.x + (P.getX(i) - center.x) * 0.86, center.y + (P.getY(i) - center.y) * 0.86, center.z + (P.getZ(i) - center.z) * 0.86);
      C.setXYZ(i, C.getX(i) * 0.72, C.getY(i) * 0.72, C.getZ(i) * 0.72);
    }
  }
  const foliage = mergeGeometries(blobs)!;
  return { trunk: trunkGeo, foliage, leaves, trunkRadius: trunkR };
}

export interface TreePlacement {
  x: number;
  z: number;
  y?: number;
  variant?: number;
  scale?: number;
}

export function buildTrees(placements: TreePlacement[], mats: Materials, physics: Physics, parent: THREE.Object3D) {
  const variants = [makeTreeVariant(11, 'round'), makeTreeVariant(23, 'tall'), makeTreeVariant(37, 'wide')];
  const foliageMat = mats.foliage.clone();
  foliageMat.name = 'foliageWind';
  addWind(foliageMat, 0.035, 'tree');
  const leafMat = new THREE.MeshStandardMaterial({
    name: 'leafCards', map: leafTexture(), alphaTest: 0.42, side: THREE.DoubleSide, vertexColors: true, roughness: 0.75,
  });
  addWind(leafMat, 0.035, 'tree');
  const r = rand(5);
  const groups: TreePlacement[][] = variants.map(() => []);
  placements.forEach((p) => groups[p.variant ?? Math.floor(r() * variants.length)].push(p));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), t = new THREE.Vector3();
  variants.forEach((v, vi) => {
    const list = groups[vi];
    if (!list.length) return;
    const trunks = new THREE.InstancedMesh(v.trunk, mats.bark, list.length);
    const leaves = new THREE.InstancedMesh(v.foliage, foliageMat, list.length);
    const cards = new THREE.InstancedMesh(v.leaves, leafMat, list.length);
    list.forEach((p, i) => {
      const sc = p.scale ?? 0.85 + r() * 0.35;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI * 2);
      s.set(sc, sc * (0.9 + r() * 0.2), sc);
      t.set(p.x, p.y ?? 0.12, p.z);
      m.compose(t, q, s);
      trunks.setMatrixAt(i, m);
      leaves.setMatrixAt(i, m);
      cards.setMatrixAt(i, m);
      physics.addCylinder({ x: p.x, y: (p.y ?? 0.12) + 1.5, z: p.z }, 1.5, v.trunkRadius * sc + 0.05, G.PROPS);
    });
    for (const im of [trunks, leaves, cards]) {
      im.castShadow = true;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      parent.add(im);
    }
  });
}

// ---------------------------------------------------------------------------
// Arbustos e sebes
// ---------------------------------------------------------------------------
export function buildBushes(spots: { x: number; z: number; y?: number; s?: number }[], mats: Materials, physics: Physics, parent: THREE.Object3D) {
  if (!spots.length) return;
  const geos = [0, 1, 2].map((k) => {
    const c = new THREE.Vector3(0, 0.35, 0);
    return mergeGeometries([
      blob(0.5, 0, 0.42, 0, c, 300 + k * 13, 1),
      blob(0.38, 0.32, 0.32, 0.1, c, 310 + k * 13, 1),
      blob(0.36, -0.3, 0.3, -0.12, c, 320 + k * 13, 1),
    ])!;
  });
  const mat = mats.hedge;
  const leafMat = new THREE.MeshStandardMaterial({ name: 'bushLeaves', map: leafTexture(), alphaTest: 0.42, side: THREE.DoubleSide, vertexColors: true, roughness: 0.8 });
  const cardGeos = geos.map((g, k) => leafCards([g], new THREE.Vector3(0, 0.35, 0), 600 + k, 160, 0.4));
  const r = rand(77);
  const buckets: typeof spots[] = [[], [], []];
  spots.forEach((s) => buckets[Math.floor(r() * 3)].push(s));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  buckets.forEach((list, k) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geos[k], mat, list.length);
    const ic = new THREE.InstancedMesh(cardGeos[k], leafMat, list.length);
    list.forEach((p, i) => {
      const sc = (p.s ?? 1) * (0.8 + r() * 0.4);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.28);
      m.compose(new THREE.Vector3(p.x, p.y ?? 0.12, p.z), q, new THREE.Vector3(sc, sc, sc));
      im.setMatrixAt(i, m);
      ic.setMatrixAt(i, m);
      physics.addCylinder({ x: p.x, y: (p.y ?? 0.12) + 0.4, z: p.z }, 0.4, 0.45 * sc, G.PROPS);
    });
    for (const x of [im, ic]) {
      x.castShadow = true;
      x.receiveShadow = true;
      x.computeBoundingSphere();
      parent.add(x);
    }
  });
}

/** Sebe contínua de (x0,z0) a (x1,z1): blocos orgânicos + cartões de folhas. */
export function buildHedges(runs: { x0: number; z0: number; x1: number; z1: number; h?: number }[], mats: Materials, physics: Physics, parent: THREE.Object3D) {
  const c = new THREE.Vector3(0, 0.5, 0);
  const core = mergeGeometries([
    blob(0.55, 0, 0.5, 0, c, 501, 1),
    blob(0.45, 0.35, 0.45, 0.05, c, 502, 1),
    blob(0.45, -0.35, 0.48, -0.05, c, 503, 1),
  ])!;
  const cards = leafCards([core], c, 507, 140, 0.42);
  const leafMat = new THREE.MeshStandardMaterial({ name: 'hedgeLeaves', map: leafTexture(), alphaTest: 0.42, side: THREE.DoubleSide, vertexColors: true, roughness: 0.8 });
  const items: THREE.Matrix4[] = [];
  const r = rand(99);
  for (const run of runs) {
    const h = run.h ?? 1.1;
    const dx = run.x1 - run.x0, dz = run.z1 - run.z0;
    const L = Math.hypot(dx, dz);
    const n = Math.max(1, Math.round(L / 0.85));
    const rot = Math.atan2(-dz, dx);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      items.push(new THREE.Matrix4().compose(
        new THREE.Vector3(run.x0 + dx * t, 0.12, run.z0 + dz * t),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot + (r() - 0.5) * 0.6),
        new THREE.Vector3(0.95 + r() * 0.2, h * (0.92 + r() * 0.16), 0.75 + r() * 0.1),
      ));
    }
    const cx = (run.x0 + run.x1) / 2, cz = (run.z0 + run.z1) / 2;
    physics.addBox({ x: cx, y: 0.12 + h / 2, z: cz }, { x: Math.abs(dx) / 2 + 0.35, y: h / 2, z: Math.abs(dz) / 2 + 0.35 }, { group: G.PROPS });
  }
  if (!items.length) return;
  for (const [geo, mat] of [[core, mats.hedge], [cards, leafMat]] as const) {
    const im = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = true;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    parent.add(im);
  }
}

// ---------------------------------------------------------------------------
// Grama
// ---------------------------------------------------------------------------
export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

const inRect = (x: number, z: number, r: Rect, pad = 0) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad;

export class GrassField {
  readonly chunks: { mesh: THREE.InstancedMesh; center: THREE.Vector3; full: number }[] = [];
  private density = 1;

  constructor(lawns: Rect[], exclude: Rect[], parent: THREE.Object3D, baseDensity = 9) {
    // tufo com 4 lâminas
    const blades: THREE.BufferGeometry[] = [];
    for (let b = 0; b < 4; b++) {
      const h = 0.15 + (b % 2) * 0.08, w = 0.024;
      const g = new THREE.BufferGeometry();
      const pos = new Float32Array([-w, 0, 0, w, 0, 0, -w * 0.6, h * 0.55, 0, w * 0.6, h * 0.55, 0, 0, h, 0]);
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
      const lin = (hex: string) => new THREE.Color(hex).toArray(); // Color() converte sRGB -> linear
      const c0 = lin('#2f4a1c'), c1 = lin('#4f7a2c'), c2 = lin('#93b04f');
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array([...c0, ...c0, ...c1, ...c1, ...c2]), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(10), 2));
      g.setIndex([0, 1, 3, 0, 3, 2, 2, 3, 4]);
      g.rotateZ((b - 1.5) * 0.18);
      g.rotateY(b * 0.8);
      g.translate(Math.cos(b * 2.1) * 0.05, 0, Math.sin(b * 2.1) * 0.05);
      blades.push(g);
    }
    const tuft = mergeGeometries(blades)!;
    const mat = new THREE.MeshStandardMaterial({ name: 'grassBlades', vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
    addWind(mat, 0.09, 'grass');

    const CH = 12;
    const cells = new Map<string, number[]>();
    const r = rand(1234);
    for (const L of lawns) {
      const area = (L.x1 - L.x0) * (L.z1 - L.z0);
      const n = Math.floor(area * baseDensity);
      for (let i = 0; i < n; i++) {
        const x = L.x0 + r() * (L.x1 - L.x0);
        const z = L.z0 + r() * (L.z1 - L.z0);
        if (exclude.some((e) => inRect(x, z, e, 0.05))) continue;
        const key = `${Math.floor(x / CH)},${Math.floor(z / CH)}`;
        let arr = cells.get(key);
        if (!arr) cells.set(key, (arr = []));
        arr.push(x, z, r() * Math.PI * 2, 0.7 + r() * 0.7);
      }
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), t = new THREE.Vector3();
    for (const [key, arr] of cells) {
      const count = arr.length / 4;
      const im = new THREE.InstancedMesh(tuft, mat, count);
      // embaralha para que reduzir `count` mantenha distribuição uniforme
      for (let i = 0; i < count; i++) {
        const x = arr[i * 4], z = arr[i * 4 + 1], rot = arr[i * 4 + 2], sc = arr[i * 4 + 3];
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
        s.set(sc, sc * (0.8 + (i % 7) * 0.08), sc);
        t.set(x, 0.12, z);
        m.compose(t, q, s);
        im.setMatrixAt(i, m);
      }
      im.castShadow = false;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      const [cx, cz] = key.split(',').map(Number);
      parent.add(im);
      this.chunks.push({ mesh: im, center: new THREE.Vector3((cx + 0.5) * CH, 0, (cz + 0.5) * CH), full: count });
    }
  }

  setDensity(d: number) {
    this.density = d;
    for (const c of this.chunks) c.mesh.count = Math.floor(c.full * d);
  }

  /** esconde blocos distantes para economizar GPU */
  update(cameraPos: THREE.Vector3) {
    const maxD = 34 + 26 * this.density;
    for (const c of this.chunks) {
      const d = Math.hypot(c.center.x - cameraPos.x, c.center.z - cameraPos.z);
      c.mesh.visible = this.density > 0.01 && d < maxD;
    }
  }
}
