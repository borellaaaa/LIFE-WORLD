/**
 * Casas vizinhas: volumes modernos procedurais (somente exterior).
 * Janelas são painéis de vidro escuro que se acendem à noite, simulando interiores.
 */
import * as THREE from 'three';
import type { StaticBatcher } from '../geometry';
import type { Materials } from '../materials';
import { Physics, G } from '../../physics/Physics';
import { HouseFrame } from './HouseBuilder';
import { rand } from '../textures';

export interface NeighborStyle {
  seed: number;
  wall: keyof Materials;
  accent: keyof Materials;
  twoStory: boolean;
  garageLeft: boolean;
}

export interface NeighborResult {
  litWindows: THREE.Mesh[];
  footprint: { x0: number; x1: number; z0: number; z1: number };
  porchLight: THREE.Vector3;
}

/**
 * Constrói uma casa vizinha. Frente local em +Z. `frame` posiciona no lote.
 */
export function buildNeighborHouse(
  frame: HouseFrame, style: NeighborStyle, batch: StaticBatcher, mats: Materials, physics: Physics, parent: THREE.Object3D,
): NeighborResult {
  const r = rand(style.seed);
  const M = mats;
  const wallMat = M[style.wall] as THREE.Material;
  const accentMat = M[style.accent] as THREE.Material;
  const lit: THREE.Mesh[] = [];
  void parent;
  const W = 10 + Math.floor(r() * 3), D = 8 + Math.floor(r() * 2);
  const h1 = 3.1, h2 = 2.9;
  const base = 0.15;

  const box = (mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, opts?: { roof?: boolean; tile?: number; castShadow?: boolean }) =>
    batch.box(mat, w, h, d, x, y, z, 0, opts, frame.matrix);
  const col = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const c = frame.point(x, y, z);
    physics.addBox(c, { x: w / 2, y: h / 2, z: d / 2 }, { rotY: frame.rotY, group: G.WORLD });
  };

  // fundação
  box(M.foundation, W + 0.3, base, D + 0.3, 0, base / 2, 0);
  // volume térreo
  box(wallMat, W, h1, D, 0, base + h1 / 2, 0, { tile: 1 });
  col(W, h1 + base, D, 0, (h1 + base) / 2, 0);
  // volume de destaque (garagem) com material de acento
  const gW = 3.6;
  const gx = style.garageLeft ? -W / 2 + gW / 2 : W / 2 - gW / 2;
  box(accentMat, gW + 0.02, h1 + 0.02, 0.06, gx, base + h1 / 2, D / 2 + 0.03, { tile: 1 });
  // portão da garagem
  box(M.roofEdge, 2.8, 2.3, 0.05, gx, base + 1.15, D / 2 + 0.085);
  for (let i = 1; i < 6; i++) box(M.frame, 2.76, 0.015, 0.02, gx, base + (2.3 * i) / 6, D / 2 + 0.12, { castShadow: false });

  // janelas do térreo
  const winW = 1.9 + r() * 0.8;
  const doorX = style.garageLeft ? gx + gW / 2 + 1.1 : gx - gW / 2 - 1.1;
  const winX = style.garageLeft ? W / 2 - winW / 2 - 0.8 : -W / 2 + winW / 2 + 0.8;
  const windowPanel = (x: number, y: number, z: number, w: number, h: number, rotY = 0) => {
    // moldura
    const fm = new THREE.Matrix4().makeRotationY(rotY).setPosition(x, y, z).premultiply(frame.matrix);
    const g = new THREE.BoxGeometry(w + 0.1, h + 0.1, 0.06);
    batch.add(g, M.frame, fm);
    g.dispose();
    // vidro escuro que acende à noite (agrupado: um único draw call para todas as casas)
    const pane = new THREE.BoxGeometry(w, h, 0.02);
    batch.add(pane, M.windowLit, new THREE.Matrix4().makeTranslation(0, 0, 0.025).premultiply(fm), { castShadow: false });
    pane.dispose();
    // peitoril
    const sill = new THREE.BoxGeometry(w + 0.2, 0.05, 0.14);
    const sm = new THREE.Matrix4().makeTranslation(0, -h / 2 - 0.05, 0.05).premultiply(fm);
    batch.add(sill, M.curb, sm);
    sill.dispose();
  };
  windowPanel(winX, base + 1.45, D / 2 + 0.01, winW, 1.6);
  // porta de entrada (fechada)
  box(M.doorWood, 1.0, 2.15, 0.06, doorX, base + 1.075, D / 2 + 0.03);
  box(M.handle, 0.03, 0.3, 0.04, doorX + 0.38, base + 1.05, D / 2 + 0.075);
  box(M.concrete, 2.2, base, 1.4, doorX, base / 2, D / 2 + 0.85);
  col(2.2, base, 1.4, doorX, base / 2, D / 2 + 0.85);
  // janelas laterais e dos fundos
  for (const sx of [-1, 1]) windowPanel(sx * (W / 2 + 0.01), base + 1.5, -D / 4, 1.3, 1.3, sx * Math.PI / 2);
  windowPanel(-W / 4, base + 1.5, -D / 2 - 0.01, 1.8, 1.3, Math.PI);
  windowPanel(W / 4, base + 1.6, -D / 2 - 0.01, 1.0, 1.0, Math.PI);

  let roofY = base + h1;
  if (style.twoStory) {
    // pavimento superior recuado / deslocado
    const uW = W * (0.6 + r() * 0.15), uD = D * 0.85;
    const ux = (style.garageLeft ? -1 : 1) * (W - uW) * 0.35;
    box(M.roofEdge, W + 0.3, 0.25, D + 0.3, 0, roofY + 0.125, 0, { roof: false });
    box(wallMat, uW, h2, uD, ux, roofY + 0.25 + h2 / 2, -0.3, { tile: 1 });
    col(uW, h2, uD, ux, roofY + 0.25 + h2 / 2, -0.3);
    // faixa de acento no superior
    box(accentMat, uW * 0.4, h2, 0.05, ux - uW * 0.3, roofY + 0.25 + h2 / 2, -0.3 + uD / 2 + 0.03, { tile: 1 });
    windowPanel(ux + uW * 0.12, roofY + 0.25 + 1.55, -0.3 + uD / 2 + 0.01, uW * 0.42, 1.5);
    windowPanel(ux - uW * 0.3, roofY + 0.25 + 1.55, -0.3 + uD / 2 + 0.06, 0.8, 1.5);
    roofY = roofY + 0.25 + h2;
    box(M.roofEdge, uW + 0.5, 0.28, uD + 0.5, ux, roofY + 0.14, -0.3);
  } else {
    box(M.roofEdge, W + 0.6, 0.3, D + 0.6, 0, roofY + 0.15, 0);
    box(M.roof, W + 0.3, 0.02, D + 0.3, 0, roofY + 0.31, 0, { tile: 2, castShadow: false });
  }
  // marquise da entrada
  box(M.roofEdge, 2.4, 0.12, 1.4, doorX, base + 2.65, D / 2 + 0.7);

  const a = frame.point(-W / 2, 0, -D / 2), b = frame.point(W / 2, 0, D / 2);
  return {
    litWindows: lit,
    footprint: { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z) },
    porchLight: frame.point(doorX, base + 2.5, D / 2 + 0.7),
  };
}

export const NEIGHBOR_DEPTH_HINT = 9;
