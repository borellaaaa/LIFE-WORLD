/**
 * Gera public/models/character.glb — personagem humano original do LIFE WORLD 3D.
 *
 *   npm run character
 *
 * Pipeline: SDF anatômico -> Surface Nets -> simplificação (meshoptimizer) ->
 * normais exatas pelo gradiente -> oclusão ambiente assada em cor de vértice ->
 * pesos de skin por zona + suavização -> esqueleto + animações -> GLB.
 */
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { MeshoptSimplifier } from 'meshoptimizer';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { smin, smax, valueNoise3, type SDF } from './sdf';
import { surfaceNets, sdfNormals, type RawMesh } from './surfaceNets';
import { bodyParts, BONES, EYES, hairSDF, browsSDF, lipsSDF, allowedBones, type Part, type MaterialName } from './humanoid';
import { buildClips, buildSkeleton } from './animations';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../../public/models/character.glb');

// ---------------------------------------------------------------------------
// Polyfill mínimo de FileReader para o GLTFExporter rodar no Node.
// ---------------------------------------------------------------------------
class NodeFileReader {
  result: unknown = null;
  onload: ((e: unknown) => void) | null = null;
  onloadend: ((e: unknown) => void) | null = null;
  readAsArrayBuffer(blob: Blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      this.onload?.({ target: this });
      this.onloadend?.({ target: this });
    });
  }
  readAsDataURL(blob: Blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buf).toString('base64')}`;
      this.onload?.({ target: this });
      this.onloadend?.({ target: this });
    });
  }
}
(globalThis as unknown as { FileReader: unknown }).FileReader = NodeFileReader;

const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

// ---------------------------------------------------------------------------
// SDF combinado do corpo
// ---------------------------------------------------------------------------
const parts = bodyParts();
const ordered: Part[] = [
  ...parts.filter((p) => p.op === 'add'),
  ...parts.filter((p) => p.op === 'sub'),
  ...parts.filter((p) => p.op === 'hard'),
];
const bounds = ordered.map((p) => ({ c: p.center, r: p.radius * 1.35 + 0.02 }));

const bodySDF: SDF = (x, y, z) => {
  let d = 1e9;
  for (let i = 0; i < ordered.length; i++) {
    const p = ordered[i];
    const b = bounds[i];
    const bd = Math.hypot(x - b.c[0], y - b.c[1], z - b.c[2]) - b.r;
    if (p.op === 'add') {
      if (bd > d + p.k) continue;
      d = smin(d, p.sdf(x, y, z), p.k);
    } else if (p.op === 'sub') {
      if (bd > Math.abs(d) + p.k) continue;
      d = smax(d, -p.sdf(x, y, z), p.k);
    } else {
      if (bd > d) continue;
      d = Math.min(d, p.sdf(x, y, z));
    }
  }
  return d;
};

// ---------------------------------------------------------------------------
// Utilidades de malha
// ---------------------------------------------------------------------------
function fixWinding(mesh: RawMesh, sdf: SDF) {
  const { positions: P, indices: I } = mesh;
  let score = 0;
  for (let t = 0; t < I.length; t += 3 * 37) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const cx = (P[a] + P[b] + P[c]) / 3, cy = (P[a + 1] + P[b + 1] + P[c + 1]) / 3, cz = (P[a + 2] + P[b + 2] + P[c + 2]) / 3;
    const e = 0.002;
    const gx = sdf(cx + e, cy, cz) - sdf(cx - e, cy, cz);
    const gy = sdf(cx, cy + e, cz) - sdf(cx, cy - e, cz);
    const gz = sdf(cx, cy, cz + e) - sdf(cx, cy, cz - e);
    score += Math.sign(nx * gx + ny * gy + nz * gz);
  }
  if (score < 0) {
    for (let t = 0; t < I.length; t += 3) {
      const tmp = I[t + 1];
      I[t + 1] = I[t + 2];
      I[t + 2] = tmp;
    }
  }
}

function simplify(
  mesh: RawMesh, targetTris: number, error: number,
  opts?: { normals: Float32Array; lock: Uint8Array },
): RawMesh & { source: Int32Array } {
  const target = Math.min(targetTris * 3, mesh.indices.length);
  const [idx] = opts
    ? MeshoptSimplifier.simplifyWithAttributes(
      mesh.indices, mesh.positions, 3, opts.normals, 3, [0.25, 0.25, 0.25], opts.lock, target, error, ['ErrorAbsolute'],
    )
    : MeshoptSimplifier.simplify(mesh.indices, mesh.positions, 3, target, error, ['ErrorAbsolute']);
  // compactação (guarda o índice original de cada vértice mantido)
  const remap = new Int32Array(mesh.positions.length / 3).fill(-1);
  const pos: number[] = [];
  const source: number[] = [];
  const out = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) {
    const v = idx[i];
    if (remap[v] < 0) {
      remap[v] = pos.length / 3;
      pos.push(mesh.positions[v * 3], mesh.positions[v * 3 + 1], mesh.positions[v * 3 + 2]);
      source.push(v);
    }
    out[i] = remap[v];
  }
  return { positions: new Float32Array(pos), indices: out, source: Int32Array.from(source) };
}

function bakeAO(sdf: SDF, P: Float32Array, N: Float32Array): Float32Array {
  const ao = new Float32Array(P.length / 3);
  const steps = [0.006, 0.014, 0.028, 0.05, 0.08];
  for (let v = 0; v < ao.length; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    const nx = N[v * 3], ny = N[v * 3 + 1], nz = N[v * 3 + 2];
    let occ = 0, w = 1;
    for (const s of steps) {
      const d = sdf(x + nx * s, y + ny * s, z + nz * s);
      occ += Math.max(0, s - d) * w;
      w *= 0.75;
    }
    ao[v] = Math.min(1, Math.max(0.32, 1 - occ * 9));
  }
  return ao;
}

function segDist(p: [number, number, number], a: readonly number[], b: readonly number[]) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const pax = p[0] - a[0], pay = p[1] - a[1], paz = p[2] - a[2];
  let h = (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz);
  h = Math.max(0, Math.min(1, h));
  return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h);
}

// ---------------------------------------------------------------------------
async function main() {
  await MeshoptSimplifier.ready;

  // 1. Corpo --------------------------------------------------------------
  log('Amostrando SDF do corpo...');
  let raw = surfaceNets(bodySDF, { min: [-0.76, -0.012, -0.2], max: [0.76, 1.8, 0.25], step: 0.0052 });
  log(`Surface nets: ${raw.positions.length / 3} vértices, ${raw.indices.length / 3} triângulos`);
  fixWinding(raw, bodySDF);

  // Zona e material por vértice (parte mais próxima da superfície), na malha densa
  const solid = parts.filter((p) => p.op !== 'sub');
  const classify = (P: Float32Array) => {
    const n = P.length / 3;
    const zone: string[] = new Array(n);
    const mat: MaterialName[] = new Array(n);
    for (let v = 0; v < n; v++) {
      const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
      let best = 1e9, bp = solid[0];
      for (const p of solid) {
        const d = Math.abs(p.sdf(x, y, z));
        if (d < best) { best = d; bp = p; }
      }
      zone[v] = bp.zone;
      mat[v] = bp.material;
    }
    return { zone, mat };
  };
  const rawCls = classify(raw.positions);
  // trava vértices na fronteira entre materiais para manter bordas de roupa limpas
  const lock = new Uint8Array(raw.positions.length / 3);
  for (let t = 0; t < raw.indices.length; t += 3) {
    const a = raw.indices[t], b = raw.indices[t + 1], c = raw.indices[t + 2];
    const ma = rawCls.mat[a], mb = rawCls.mat[b], mc = rawCls.mat[c];
    if (ma !== mb || mb !== mc) { lock[a] = 1; lock[b] = 1; lock[c] = 1; }
  }
  log('Classificação densa concluída; simplificando...');
  const rawNormals = sdfNormals(bodySDF, raw.positions);
  const body = simplify(raw, 46000, 0.0006, { normals: rawNormals, lock });
  raw = undefined as unknown as RawMesh;
  const nV = body.positions.length / 3;
  log(`Simplificado: ${nV} vértices, ${body.indices.length / 3} triângulos`);

  const normals = sdfNormals(bodySDF, body.positions);
  const ao = bakeAO(bodySDF, body.positions, normals);
  const vZone: string[] = Array.from(body.source, (s) => rawCls.zone[s]);
  const vMat: MaterialName[] = Array.from(body.source, (s) => rawCls.mat[s]);

  // 3. Pesos de skin -------------------------------------------------------
  const boneIndex = new Map(BONES.map((b, i) => [b.name, i]));
  const NB = BONES.length;
  let W = new Float32Array(nV * NB);
  for (let v = 0; v < nV; v++) {
    const p: [number, number, number] = [body.positions[v * 3], body.positions[v * 3 + 1], body.positions[v * 3 + 2]];
    const allowed = allowedBones(vZone[v] as Parameters<typeof allowedBones>[0]);
    let sum = 0;
    for (const [bn, mult] of Object.entries(allowed)) {
      const def = BONES[boneIndex.get(bn)!];
      const d = Math.max(segDist(p, def.pos, def.tail) * mult, 0.004);
      const w = 1 / Math.pow(d, 4);
      W[v * NB + boneIndex.get(bn)!] = w;
      sum += w;
    }
    for (let b = 0; b < NB; b++) W[v * NB + b] /= sum;
  }
  // adjacência
  const adj: Set<number>[] = Array.from({ length: nV }, () => new Set<number>());
  for (let t = 0; t < body.indices.length; t += 3) {
    const a = body.indices[t], b = body.indices[t + 1], c = body.indices[t + 2];
    adj[a].add(b); adj[a].add(c); adj[b].add(a); adj[b].add(c); adj[c].add(a); adj[c].add(b);
  }
  for (let it = 0; it < 6; it++) {
    const W2 = new Float32Array(W.length);
    for (let v = 0; v < nV; v++) {
      const nb = adj[v];
      const f = 0.5 / Math.max(1, nb.size);
      for (let b = 0; b < NB; b++) W2[v * NB + b] = W[v * NB + b] * 0.5;
      for (const u of nb) for (let b = 0; b < NB; b++) W2[v * NB + b] += W[u * NB + b] * f;
    }
    W = W2;
  }
  const skinIndex = new Uint16Array(nV * 4);
  const skinWeight = new Float32Array(nV * 4);
  for (let v = 0; v < nV; v++) {
    const list = Array.from({ length: NB }, (_, b) => [b, W[v * NB + b]] as [number, number])
      .sort((a, b) => b[1] - a[1]).slice(0, 4);
    const s = list.reduce((acc, [, w]) => acc + w, 0) || 1;
    list.forEach(([b, w], i) => {
      skinIndex[v * 4 + i] = b;
      skinWeight[v * 4 + i] = w < 0.01 ? 0 : w / s;
    });
    const s2 = skinWeight[v * 4] + skinWeight[v * 4 + 1] + skinWeight[v * 4 + 2] + skinWeight[v * 4 + 3];
    for (let i = 0; i < 4; i++) skinWeight[v * 4 + i] /= s2;
  }

  // 4. Grupos por material --------------------------------------------------
  const MAT_ORDER: MaterialName[] = ['Skin', 'Lips', 'Shirt', 'Pants', 'Shoes', 'Sole'];
  const triByMat = new Map<MaterialName, number[]>(MAT_ORDER.map((m) => [m, []]));
  for (let t = 0; t < body.indices.length; t += 3) {
    const a = body.indices[t], b = body.indices[t + 1], c = body.indices[t + 2];
    const ms = [vMat[a], vMat[b], vMat[c]];
    const m = ms[1] === ms[2] ? ms[1] : ms[0];
    triByMat.get(m)!.push(a, b, c);
  }
  const finalIdx: number[] = [];
  const geo = new THREE.BufferGeometry();
  const usedMats: MaterialName[] = [];
  for (const m of MAT_ORDER) {
    const list = triByMat.get(m)!;
    if (!list.length) continue;
    geo.addGroup(finalIdx.length, list.length, usedMats.length);
    usedMats.push(m);
    finalIdx.push(...list);
  }
  geo.setIndex(finalIdx);
  geo.setAttribute('position', new THREE.BufferAttribute(body.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  // cor de vértice = oclusão ambiente * tingimento suave (lábios, bochechas)
  const colors = new Float32Array(nV * 3);
  const lips = lipsSDF();
  const LIP_TINT = [0.86, 0.66, 0.66];
  for (let v = 0; v < nV; v++) {
    const x = body.positions[v * 3], y = body.positions[v * 3 + 1], z = body.positions[v * 3 + 2];
    let r = 1, g = 1, b = 1;
    if (vMat[v] === 'Skin') {
      const lf = 1 - Math.min(1, Math.max(0, (lips(x, y, z) - 0.0004) / 0.0026));
      const lt = lf * lf * (3 - 2 * lf);
      r += (LIP_TINT[0] - 1) * lt; g += (LIP_TINT[1] - 1) * lt; b += (LIP_TINT[2] - 1) * lt;
      // leve rubor nas bochechas e nariz
      const ch = Math.max(0, 1 - Math.hypot(Math.abs(x) - 0.042, y - 1.628, z - 0.07) / 0.028);
      const ns = Math.max(0, 1 - Math.hypot(x, y - 1.632, z - 0.11) / 0.02);
      const blush = Math.max(ch * 0.6, ns * 0.5);
      g -= 0.06 * blush; b -= 0.05 * blush;
    }
    colors.set([ao[v] * r, ao[v] * g, ao[v] * b], v * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));

  const PALETTE: Record<MaterialName, { color: string; roughness: number }> = {
    Skin: { color: '#c98f6e', roughness: 0.62 },
    Lips: { color: '#a8635a', roughness: 0.5 },
    Shirt: { color: '#3d6f7d', roughness: 0.88 },
    Pants: { color: '#2f3b4d', roughness: 0.82 },
    Shoes: { color: '#e9e6df', roughness: 0.6 },
    Sole: { color: '#8f8a82', roughness: 0.9 },
    Hair: { color: '#2b1d15', roughness: 0.55 },
  };
  const mkMat = (m: MaterialName) => {
    const mat = new THREE.MeshStandardMaterial({
      name: m, color: PALETTE[m].color, roughness: PALETTE[m].roughness, metalness: 0, vertexColors: true,
    });
    return mat;
  };

  // 5. Esqueleto + malha skinned ------------------------------------------
  const { root: hips, bones } = buildSkeleton();
  const boneList = BONES.map((b) => bones.get(b.name)!);
  const skinned = new THREE.SkinnedMesh(geo, usedMats.map(mkMat));
  skinned.name = 'Body';
  const character = new THREE.Group();
  character.name = 'LifeWorldCharacter';
  character.add(hips);
  character.add(skinned);
  character.updateMatrixWorld(true);
  skinned.bind(new THREE.Skeleton(boneList));

  // 6. Cabelo -------------------------------------------------------------
  log('Gerando cabelo...');
  const surfaceZ = (x: number, y: number) => {
    let z = 0.16;
    for (let i = 0; i < 200 && z > 0; i++) {
      const d = bodySDF(x, y, z);
      if (d < 0.0002) break;
      z -= Math.max(d * 0.8, 0.0002);
    }
    return z;
  };
  const hair = hairSDF(valueNoise3, browsSDF(surfaceZ));
  let hairRaw = surfaceNets(hair, { min: [-0.12, 1.56, -0.14], max: [0.12, 1.81, 0.14], step: 0.0028 });
  fixWinding(hairRaw, hair);
  hairRaw = simplify(hairRaw, 9000, 0.0005);
  const hairN = sdfNormals(hair, hairRaw.positions, 0.001);
  const hairAO = bakeAO((x, y, z) => Math.min(hair(x, y, z), bodySDF(x, y, z)), hairRaw.positions, hairN);
  const headPos = BONES.find((b) => b.name === 'Head')!.pos;
  const hp = hairRaw.positions.slice();
  for (let i = 0; i < hp.length; i += 3) {
    hp[i] -= headPos[0]; hp[i + 1] -= headPos[1]; hp[i + 2] -= headPos[2];
  }
  const hairGeo = new THREE.BufferGeometry();
  hairGeo.setAttribute('position', new THREE.BufferAttribute(hp, 3));
  hairGeo.setAttribute('normal', new THREE.BufferAttribute(hairN, 3));
  const hc = new Float32Array(hp.length);
  for (let v = 0; v < hairAO.length; v++) hc.set([hairAO[v], hairAO[v], hairAO[v]], v * 3);
  hairGeo.setAttribute('color', new THREE.BufferAttribute(hc, 3));
  hairGeo.setIndex(new THREE.BufferAttribute(hairRaw.indices, 1));
  const hairMesh = new THREE.Mesh(hairGeo, mkMat('Hair'));
  hairMesh.name = 'Hair';
  const headBone = bones.get('Head')!;
  headBone.add(hairMesh);
  log(`Cabelo: ${hp.length / 3} vértices, ${hairRaw.indices.length / 3} triângulos`);

  // 7. Olhos ----------------------------------------------------------------
  const eyeMat = new THREE.MeshStandardMaterial({ name: 'Eye', color: '#ffffff', roughness: 0.15, vertexColors: true });
  for (const [i, e] of EYES.entries()) {
    const g = new THREE.SphereGeometry(e.radius, 28, 18);
    g.rotateX(Math.PI / 2); // polo apontando para +Z
    const pos = g.getAttribute('position');
    const col = new Float32Array(pos.count * 3);
    for (let v = 0; v < pos.count; v++) {
      const z = pos.getZ(v) / e.radius;
      const ang = Math.acos(Math.min(1, Math.max(-1, z)));
      let c: [number, number, number] = [0.93, 0.91, 0.88];
      if (ang < 0.19) c = [0.04, 0.03, 0.03];
      else if (ang < 0.48) {
        const t = (ang - 0.19) / 0.29;
        c = [0.24 + 0.1 * t, 0.15 + 0.05 * t, 0.08 + 0.02 * t];
      } else if (ang < 0.56) c = [0.18, 0.12, 0.08];
      col.set(c, v * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.translate(e.center[0] - headPos[0], e.center[1] - headPos[1], e.center[2] - headPos[2]);
    const m = new THREE.Mesh(g, eyeMat);
    m.name = i === 0 ? 'EyeL' : 'EyeR';
    headBone.add(m);
  }

  // 8. Animações ----------------------------------------------------------
  const { clips, report } = buildClips();
  report.forEach((r) => log(r));
  const walk = clips.find((c) => c.clip.name === 'Walk')!;
  const run = clips.find((c) => c.clip.name === 'Run')!;
  character.userData = {
    lifeWorld: {
      name: 'Lucas',
      generator: 'scripts/character/build-character.ts',
      height: 1.775,
      locomotion: { walkSpeed: walk.naturalSpeed, runSpeed: run.naturalSpeed },
      clips: clips.map((c) => c.clip.name),
    },
  };

  // 9. Exportação ---------------------------------------------------------
  const scene = new THREE.Scene();
  scene.add(character);
  const exporter = new GLTFExporter();
  const glb = (await exporter.parseAsync(scene, {
    binary: true,
    animations: clips.map((c) => c.clip),
    onlyVisible: false,
  })) as ArrayBuffer;
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, Buffer.from(glb));
  log(`GLB salvo em ${OUT} (${(glb.byteLength / 1024).toFixed(0)} KB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
