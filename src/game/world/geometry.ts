/**
 * Utilitários de geometria e o agrupador de geometria estática (StaticBatcher),
 * que funde todas as peças estáticas do cenário por material — poucos draw calls.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LAYER_ROOF } from '../core/Engine';

/** Caixa com UVs em escala de mundo (a textura não estica). `tile` = metros por repetição. */
export function boxUV(w: number, h: number, d: number, tile = 1): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  // ordem das faces: +x, -x, +y, -y, +z, -z (4 vértices cada)
  const spans: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * (spans[f][0] / tile), uv.getY(k) * (spans[f][1] / tile));
    }
  }
  return g;
}

/** Plano horizontal (XZ) com UV em escala de mundo, virado para cima. */
export function groundPlane(w: number, d: number, tile = 1, offset?: [number, number]): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (pos.getX(i) + (offset?.[0] ?? 0)) / tile, (-pos.getZ(i) + (offset?.[1] ?? 0)) / tile);
  }
  return g;
}

export interface BatchOptions {
  castShadow?: boolean;
  receiveShadow?: boolean;
  /** pertence ao telhado/forro (some da câmera quando o jogador está dentro) */
  roof?: boolean;
}

interface Bucket {
  material: THREE.Material;
  geoms: THREE.BufferGeometry[];
  opts: Required<BatchOptions>;
}

export class StaticBatcher {
  private buckets = new Map<string, Bucket>();
  private tmp = new THREE.Matrix4();

  add(geometry: THREE.BufferGeometry, material: THREE.Material, matrix: THREE.Matrix4, opts: BatchOptions = {}) {
    const o: Required<BatchOptions> = { castShadow: true, receiveShadow: true, roof: false, ...opts };
    const key = `${material.uuid}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}${o.roof ? 1 : 0}`;
    let b = this.buckets.get(key);
    if (!b) {
      b = { material, geoms: [], opts: o };
      this.buckets.set(key, b);
    }
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    // garante atributos uniformes para o merge
    if (!g.getAttribute('uv')) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    }
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    for (const name of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
    }
    if (!g.getAttribute('color') && (material as THREE.MeshStandardMaterial).vertexColors) {
      const c = new Float32Array(g.getAttribute('position').count * 3).fill(1);
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    }
    g.applyMatrix4(matrix);
    b.geoms.push(g);
  }

  /** Atalho: adiciona uma caixa (w,h,d) centrada em (x,y,z) com rotação Y opcional. */
  box(
    material: THREE.Material, w: number, h: number, d: number,
    x: number, y: number, z: number, rotY = 0, opts?: BatchOptions & { tile?: number }, parent?: THREE.Matrix4,
  ) {
    const g = boxUV(w, h, d, opts?.tile ?? 1);
    this.tmp.makeRotationY(rotY).setPosition(x, y, z);
    if (parent) this.tmp.premultiply(parent);
    this.add(g, material, this.tmp, opts);
    g.dispose();
  }

  build(parent: THREE.Object3D) {
    const meshes: THREE.Mesh[] = [];
    for (const b of this.buckets.values()) {
      const merged = mergeGeometries(b.geoms, false);
      b.geoms.forEach((g) => g.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, b.material);
      mesh.castShadow = b.opts.castShadow;
      mesh.receiveShadow = b.opts.receiveShadow;
      mesh.matrixAutoUpdate = false;
      if (b.opts.roof) mesh.layers.set(LAYER_ROOF);
      mesh.name = `batch:${b.material.name}`;
      parent.add(mesh);
      meshes.push(mesh);
    }
    this.buckets.clear();
    return meshes;
  }
}
