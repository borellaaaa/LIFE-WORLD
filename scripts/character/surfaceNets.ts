/**
 * Extração de malha a partir de um campo de distância (Naive Surface Nets).
 * Gera uma malha fechada e suave; os vértices são projetados na superfície
 * usando o gradiente do SDF para máxima precisão.
 */
import type { SDF } from './sdf';

export interface RawMesh {
  positions: Float32Array;
  indices: Uint32Array;
}

export interface GridSpec {
  min: [number, number, number];
  max: [number, number, number];
  step: number;
}

export function surfaceNets(sdf: SDF, grid: GridSpec): RawMesh {
  const { min, max, step } = grid;
  const nx = Math.ceil((max[0] - min[0]) / step) + 1;
  const ny = Math.ceil((max[1] - min[1]) / step) + 1;
  const nz = Math.ceil((max[2] - min[2]) / step) + 1;
  const field = new Float32Array(nx * ny * nz);
  const idx = (i: number, j: number, k: number) => i + nx * (j + ny * k);

  for (let k = 0; k < nz; k++) {
    const z = min[2] + k * step;
    for (let j = 0; j < ny; j++) {
      const y = min[1] + j * step;
      for (let i = 0; i < nx; i++) {
        field[idx(i, j, k)] = sdf(min[0] + i * step, y, z);
      }
    }
  }

  const cellVertex = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cidx = (i: number, j: number, k: number) => i + (nx - 1) * (j + (ny - 1) * k);
  const verts: number[] = [];

  // Offsets dos 8 cantos e 12 arestas de uma célula.
  const corners = [
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
    [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
  ];
  const edges = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 2], [1, 3], [4, 6], [5, 7],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const cv = new Float32Array(8);

  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const o = corners[c];
          const val = field[idx(i + o[0], j + o[1], k + o[2])];
          cv[c] = val;
          if (val < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (const [a, b] of edges) {
          const va = cv[a], vb = cv[b];
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          const oa = corners[a], ob = corners[b];
          sx += oa[0] + (ob[0] - oa[0]) * t;
          sy += oa[1] + (ob[1] - oa[1]) * t;
          sz += oa[2] + (ob[2] - oa[2]) * t;
          n++;
        }
        let px = min[0] + (i + sx / n) * step;
        let py = min[1] + (j + sy / n) * step;
        let pz = min[2] + (k + sz / n) * step;
        // Projeção na superfície (2 passos de Newton).
        for (let it = 0; it < 2; it++) {
          const d = sdf(px, py, pz);
          const e = step * 0.25;
          const gx = sdf(px + e, py, pz) - sdf(px - e, py, pz);
          const gy = sdf(px, py + e, pz) - sdf(px, py - e, pz);
          const gz = sdf(px, py, pz + e) - sdf(px, py, pz - e);
          const gl = Math.hypot(gx, gy, gz) || 1;
          const mv = Math.max(-step, Math.min(step, d));
          px -= (gx / gl) * mv;
          py -= (gy / gl) * mv;
          pz -= (gz / gl) * mv;
        }
        cellVertex[cidx(i, j, k)] = verts.length / 3;
        verts.push(px, py, pz);
      }
    }
  }

  const tris: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) tris.push(a, c, b, a, d, c);
    else tris.push(a, b, c, a, c, d);
  };

  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const v0 = field[idx(i, j, k)] < 0;
        // aresta em X
        if (i < nx - 1 && j > 0 && k > 0 && j < ny - 1 && k < nz - 1) {
          const v1 = field[idx(i + 1, j, k)] < 0;
          if (v0 !== v1) {
            quad(
              cellVertex[cidx(i, j - 1, k - 1)],
              cellVertex[cidx(i, j, k - 1)],
              cellVertex[cidx(i, j, k)],
              cellVertex[cidx(i, j - 1, k)],
              !v0,
            );
          }
        }
        // aresta em Y
        if (j < ny - 1 && i > 0 && k > 0 && i < nx - 1 && k < nz - 1) {
          const v1 = field[idx(i, j + 1, k)] < 0;
          if (v0 !== v1) {
            quad(
              cellVertex[cidx(i - 1, j, k - 1)],
              cellVertex[cidx(i - 1, j, k)],
              cellVertex[cidx(i, j, k)],
              cellVertex[cidx(i, j, k - 1)],
              !v0,
            );
          }
        }
        // aresta em Z
        if (k < nz - 1 && i > 0 && j > 0 && i < nx - 1 && j < ny - 1) {
          const v1 = field[idx(i, j, k + 1)] < 0;
          if (v0 !== v1) {
            quad(
              cellVertex[cidx(i - 1, j - 1, k)],
              cellVertex[cidx(i, j - 1, k)],
              cellVertex[cidx(i, j, k)],
              cellVertex[cidx(i - 1, j, k)],
              !v0,
            );
          }
        }
      }
    }
  }

  return { positions: new Float32Array(verts), indices: new Uint32Array(tris) };
}

/** Normais suaves a partir do gradiente do SDF. */
export function sdfNormals(sdf: SDF, positions: Float32Array, eps = 0.0015): Float32Array {
  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    const gx = sdf(x + eps, y, z) - sdf(x - eps, y, z);
    const gy = sdf(x, y + eps, z) - sdf(x, y - eps, z);
    const gz = sdf(x, y, z + eps) - sdf(x, y, z - eps);
    const l = Math.hypot(gx, gy, gz) || 1;
    out[i] = gx / l;
    out[i + 1] = gy / l;
    out[i + 2] = gz / l;
  }
  return out;
}
