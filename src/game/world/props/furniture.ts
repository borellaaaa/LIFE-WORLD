/**
 * Mobiliário procedural da casa. Cada função constrói o móvel (geometria
 * estática agrupada + colisores) e devolve pontos de ancoragem para atividades.
 *
 * Convenção: a "frente" do móvel aponta para +Z local; `r` gira o móvel em Y.
 */
import * as THREE from 'three';
import type { HouseBuilder } from '../house/HouseBuilder';
import { G } from '../../physics/Physics';
import type { Placement } from '../../sim/activities';

export class Placer {
  constructor(readonly b: HouseBuilder, readonly x: number, readonly y: number, readonly z: number, readonly r = 0) {}

  p(fx: number, fz: number): [number, number] {
    const c = Math.cos(this.r), s = Math.sin(this.r);
    return [this.x + c * fx + s * fz, this.z - s * fx + c * fz];
  }

  box(mat: THREE.Material, w: number, h: number, d: number, fx: number, fy: number, fz: number, opts?: { castShadow?: boolean; receiveShadow?: boolean; tile?: number; rot?: number }) {
    const [px, pz] = this.p(fx, fz);
    this.b.box(mat, w, h, d, px, this.y + fy, pz, this.r + (opts?.rot ?? 0), opts);
  }

  geo(g: THREE.BufferGeometry, mat: THREE.Material, fx: number, fy: number, fz: number, opts?: { castShadow?: boolean; receiveShadow?: boolean; rot?: number }) {
    const [px, pz] = this.p(fx, fz);
    const m = new THREE.Matrix4().makeRotationY(this.r + (opts?.rot ?? 0)).setPosition(px, this.y + fy, pz).premultiply(this.b.frame.matrix);
    this.b.batch.add(g, mat, m, opts);
    g.dispose();
  }

  cyl(mat: THREE.Material, rt: number, rb: number, h: number, fx: number, fy: number, fz: number, seg = 20, opts?: { castShadow?: boolean }) {
    this.geo(new THREE.CylinderGeometry(rt, rb, h, seg), mat, fx, fy, fz, opts);
  }

  collider(w: number, h: number, d: number, fx: number, fy: number, fz: number) {
    const [px, pz] = this.p(fx, fz);
    this.b.collider(w, h, d, px, this.y + fy, pz, this.r, G.PROPS);
  }

  world(fx: number, fy: number, fz: number) {
    const [px, pz] = this.p(fx, fz);
    return this.b.frame.point(px, this.y + fy, pz);
  }

  yaw(extra = 0) {
    return this.b.frame.yaw(this.r + extra);
  }

  place(fx: number, fz: number, yawExtra = 0, fy = 0): Placement {
    return { position: this.world(fx, fy, fz), yaw: this.yaw(yawExtra) };
  }
}

const M = (b: HouseBuilder) => b.mats;

/** Almofada arredondada (caixa com cantos suaves via escala de esfera achatada). */
function cushion(w: number, h: number, d: number) {
  const g = new THREE.BoxGeometry(w, h, d, 6, 3, 6);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const nx = (v.x / (w / 2)), ny = (v.y / (h / 2)), nz = (v.z / (d / 2));
    const k = 0.18;
    const sx = 1 - k * Math.pow(Math.abs(ny * nz), 2) * 0.5;
    const sy = 1 - k * Math.pow(Math.abs(nx * nz), 2);
    const sz = 1 - k * Math.pow(Math.abs(nx * ny), 2) * 0.5;
    pos.setXYZ(i, v.x * sx, v.y * (sy + 0.06 * (1 - nx * nx) * (1 - nz * nz) * Math.sign(ny)), v.z * sz);
  }
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
export function sofa(b: HouseBuilder, x: number, y: number, z: number, r: number) {
  const P = new Placer(b, x, y, z, r);
  const m = M(b);
  const W = 2.25, D = 0.95;
  P.box(m.woodDark, W, 0.1, D - 0.05, 0, 0.11, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.cyl(m.blackMatte, 0.02, 0.015, 0.08, sx * (W / 2 - 0.08), 0.04, sz * (D / 2 - 0.1), 8);
  P.box(m.fabricSofa, W, 0.42, 0.18, 0, 0.16 + 0.42, -D / 2 + 0.09); // encosto
  P.box(m.fabricSofa, 0.18, 0.3, D, -W / 2 + 0.09, 0.16 + 0.22, 0); // braços
  P.box(m.fabricSofa, 0.18, 0.3, D, W / 2 - 0.09, 0.16 + 0.22, 0);
  for (const i of [-1, 0, 1]) {
    P.geo(cushion((W - 0.36) / 3 - 0.01, 0.17, D - 0.22), m.fabricSofa, i * ((W - 0.36) / 3), 0.16 + 0.1 + 0.07, 0.07);
    P.geo(cushion((W - 0.36) / 3 - 0.02, 0.4, 0.16), m.fabricSofa, i * ((W - 0.36) / 3), 0.6, -D / 2 + 0.26, { rot: 0 });
  }
  P.geo(cushion(0.4, 0.38, 0.13), m.fabricCushion, -W / 2 + 0.42, 0.62, -D / 2 + 0.37);
  P.geo(cushion(0.38, 0.36, 0.13), m.fabricCushion, W / 2 - 0.42, 0.62, -D / 2 + 0.37);
  P.collider(W, 0.5, D, 0, 0.25, 0);
  P.collider(W, 0.85, 0.22, 0, 0.42, -D / 2 + 0.11);
  return {
    seat: (i: -1 | 0 | 1) => P.place(i * 0.62, 0.1),
    front: (i: -1 | 0 | 1) => P.place(i * 0.62, 0.95),
    focus: P.world(0, 0.5, 0.2),
  };
}

export function armchair(b: HouseBuilder, x: number, y: number, z: number, r: number) {
  const P = new Placer(b, x, y, z, r);
  const m = M(b);
  P.box(m.woodDark, 0.82, 0.08, 0.82, 0, 0.12, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.cyl(m.woodDark, 0.02, 0.016, 0.1, sx * 0.34, 0.05, sz * 0.34, 8);
  P.geo(cushion(0.62, 0.16, 0.62), m.fabricCushion, 0, 0.29, 0.06);
  P.box(m.fabricCushion, 0.82, 0.5, 0.15, 0, 0.6, -0.34);
  P.box(m.fabricCushion, 0.12, 0.26, 0.8, -0.35, 0.38, 0);
  P.box(m.fabricCushion, 0.12, 0.26, 0.8, 0.35, 0.38, 0);
  P.collider(0.82, 0.85, 0.82, 0, 0.42, 0);
  return { seat: P.place(0, 0.1), front: P.place(0, 0.85), focus: P.world(0, 0.5, 0.2) };
}

export function coffeeTable(b: HouseBuilder, x: number, y: number, z: number, r: number) {
  const P = new Placer(b, x, y, z, r);
  const m = M(b);
  P.box(m.wood, 1.15, 0.05, 0.62, 0, 0.42, 0);
  P.box(m.woodDark, 1.05, 0.03, 0.52, 0, 0.12, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(m.metalDark, 0.03, 0.42, 0.03, sx * 0.53, 0.21, sz * 0.27);
  // livro e vaso decorativos
  P.box(m.books, 0.24, 0.05, 0.17, -0.25, 0.47, 0.05);
  P.cyl(m.ceramic, 0.05, 0.04, 0.16, 0.3, 0.53, -0.05, 16);
  P.collider(1.15, 0.45, 0.62, 0, 0.225, 0);
}

export function rug(b: HouseBuilder, x: number, y: number, z: number, w: number, d: number, mat: THREE.Material) {
  const P = new Placer(b, x, y, z, 0);
  P.box(mat, w, 0.012, d, 0, 0.006, 0, { castShadow: false, tile: 1.5 });
}

export function tvUnit(b: HouseBuilder, x: number, y: number, z: number, r: number) {
  const P = new Placer(b, x, y, z, r);
  const m = M(b);
  P.box(m.woodDark, 1.9, 0.45, 0.42, 0, 0.3, 0);
  P.box(m.cabinet, 0.6, 0.36, 0.02, -0.62, 0.3, 0.215);
  P.box(m.cabinet, 0.6, 0.36, 0.02, 0.62, 0.3, 0.215);
  for (const sx of [-1, 1]) P.box(m.metalDark, 0.04, 0.08, 0.38, sx * 0.85, 0.04, 0);
  // TV de tela plana
  P.box(m.blackGloss, 1.42, 0.82, 0.045, 0, 1.05, -0.02);
  P.box(m.metalDark, 0.3, 0.02, 0.18, 0, 0.535, 0);
  P.box(m.metalDark, 0.05, 0.12, 0.04, 0, 0.6, -0.04);
  P.collider(1.9, 0.6, 0.42, 0, 0.3, 0);
  // tela (malha separada para ligar/desligar)
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(1.36, 0.76),
    new THREE.MeshStandardMaterial({ name: 'tvScreen', color: '#050607', roughness: 0.18, metalness: 0.3, emissive: '#000000' }),
  );
  screen.position.copy(P.world(0, 1.05, 0.004));
  screen.rotation.y = P.yaw();
  b.parent.add(screen);
  return { screen, focus: P.world(0, 0.9, 0.1) };
}

export function bookshelf(b: HouseBuilder, x: number, y: number, z: number, r: number) {
  const P = new Placer(b, x, y, z, r);
  const m = M(b);
  const W = 1.3, H = 1.9, D = 0.34;
  P.box(m.wood, 0.03, H, D, -W / 2 + 0.015, H / 2, 0);
  P.box(m.wood, 0.03, H, D, W / 2 - 0.015, H / 2, 0);
  P.box(m.wood, W, 0.02, D, 0, H - 0.01, 0);
  P.box(m.woodDark, W, 0.02, 0.02, 0, H / 2, -D / 2 + 0.01);
  const shelves = 5;
  for (let i = 0; i < shelves; i++) {
    const sy = 0.05 + i * (H - 0.1) / (shelves - 1);
    P.box(m.wood, W - 0.06, 0.025, D - 0.02, 0, sy, 0.01);
    if (i === shelves - 1) continue;
    // livros com cores variadas (cor de vértice)
    let cx = -W / 2 + 0.06;
    let seed = i * 97 + 13;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    while (cx < W / 2 - 0.12) {
      const bw = 0.025 + rnd() * 0.035;
      const bh = 0.2 + rnd() * 0.1;
      if (rnd() < 0.12) { cx += 0.08; continue; }
      const g = new THREE.BoxGeometry(bw, bh, 0.2 + rnd() * 0.05);
      const pal = [[0.55, 0.16, 0.14], [0.15, 0.27, 0.42], [0.82, 0.72, 0.5], [0.2, 0.36, 0.3], [0.9, 0.88, 0.84], [0.32, 0.22, 0.18], [0.72, 0.45, 0.2]];
      const c = new THREE.Color().setRGB(...(pal[Math.floor(rnd() * pal.length)] as [number, number, number]), THREE.SRGBColorSpace).toArray();
      const col = new Float32Array(g.getAttribute('position').count * 3);
      for (let k = 0; k < col.length; k += 3) col.set(c, k);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      P.geo(g, m.books, cx + bw / 2, sy + 0.0125 + bh / 2, 0.02, { castShadow: false });
      cx += bw + 0.003;
    }
  }
  P.collider(W, H, D, 0, H / 2, 0);
  return { focus: P.world(0, 1.2, 0.2), front: P.place(0, 0.75, Math.PI) };
}

export function floorLamp(b: HouseBuilder, x: number, y: number, z: number) {
  const P = new Placer(b, x, y, z, 0);
  const m = M(b);
  P.cyl(m.metalDark, 0.16, 0.18, 0.03, 0, 0.015, 0, 24);
  P.cyl(m.metalDark, 0.012, 0.012, 1.5, 0, 0.78, 0, 8);
  P.cyl(m.fabricBed, 0.16, 0.22, 0.28, 0, 1.6, 0, 24, { castShadow: false });
  P.collider(0.36, 1.7, 0.36, 0, 0.85, 0);
  return P.world(0, 1.55, 0);
}

export function plant(b: HouseBuilder, x: number, y: number, z: number, scale = 1) {
  const P = new Placer(b, x, y, z, 0);
  const m = M(b);
  P.cyl(m.potTerracotta, 0.2 * scale, 0.15 * scale, 0.42 * scale, 0, 0.21 * scale, 0, 18);
  P.cyl(m.soil, 0.185 * scale, 0.185 * scale, 0.02, 0, 0.41 * scale, 0, 18);
  // folhas: planos curvos em leque
  const leaves = 14;
  for (let i = 0; i < leaves; i++) {
    const g = new THREE.PlaneGeometry(0.13 * scale, 0.6 * scale, 1, 4);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    for (let k = 0; k < pos.count; k++) {
      const yy = pos.getY(k) / (0.6 * scale) + 0.5;
      pos.setZ(k, -yy * yy * 0.25 * scale);
      pos.setX(k, pos.getX(k) * (1 - Math.pow(yy * 2 - 1, 4) * 0.7));
    }
    g.translate(0, 0.3 * scale, 0);
    g.rotateX(-0.25 - (i % 3) * 0.18);
    g.rotateY((i / leaves) * Math.PI * 2 + (i % 2) * 0.3);
    g.computeVertexNormals();
    P.geo(g, m.plantLeaf, 0, 0.42 * scale, 0, { castShadow: true });
  }
  P.collider(0.4 * scale, 0.8 * scale, 0.4 * scale, 0, 0.4 * scale, 0);
}

export function desk(b: HouseBuilder, x: number, y: number, z: number, r: number) {
  const P = new Placer(b, x, y, z, r);
  const m = M(b);
  P.box(m.wood, 1.3, 0.04, 0.65, 0, 0.74, 0);
  for (const sx of [-1, 1]) {
    P.box(m.metalDark, 0.04, 0.72, 0.04, sx * 0.6, 0.36, 0.27);
    P.box(m.metalDark, 0.04, 0.72, 0.04, sx * 0.6, 0.36, -0.27);
    P.box(m.metalDark, 0.04, 0.04, 0.58, sx * 0.6, 0.06, 0);
  }
  // monitor, teclado, mouse
  P.box(m.blackGloss, 0.62, 0.37, 0.025, 0, 1.03, -0.18);
  P.box(m.metalDark, 0.04, 0.2, 0.04, 0, 0.86, -0.2);
  P.box(m.metalDark, 0.2, 0.01, 0.16, 0, 0.765, -0.2);
  P.box(m.blackMatte, 0.44, 0.02, 0.14, 0, 0.77, 0.08);
  P.box(m.blackMatte, 0.06, 0.02, 0.1, 0.32, 0.77, 0.1);
  P.collider(1.3, 0.78, 0.65, 0, 0.39, 0);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.58, 0.33),
    new THREE.MeshStandardMaterial({ name: 'pcScreen', color: '#050607', roughness: 0.2, emissive: '#000000' }),
  );
  screen.position.copy(P.world(0, 1.03, -0.166));
  screen.rotation.y = P.yaw();
  b.parent.add(screen);
  // cadeira de escritório (de frente para a mesa: olhando para -Z local)
  const [chx, chz] = P.p(0, 0.62);
  const C = new Placer(b, chx, P.y, chz, P.r + Math.PI);
  C.cyl(m.metalDark, 0.025, 0.025, 0.4, 0, 0.22, 0, 10);
  C.cyl(m.blackMatte, 0.3, 0.3, 0.03, 0, 0.03, 0, 5);
  C.geo(cushion(0.48, 0.08, 0.46), m.blackMatte, 0, 0.45, 0);
  C.box(m.blackMatte, 0.44, 0.48, 0.06, 0, 0.78, -0.24);
  C.collider(0.5, 0.95, 0.5, 0, 0.47, 0);
  return {
    seat: C.place(0, 0.0),
    exit: C.place(0, -0.78),
    focus: P.world(0, 0.9, 0.3),
    screen,
  };
}

export function sideTable(b: HouseBuilder, x: number, y: number, z: number, withPhone = false) {
  const P = new Placer(b, x, y, z, 0);
  const m = M(b);
  P.cyl(m.wood, 0.24, 0.24, 0.035, 0, 0.56, 0, 24);
  P.cyl(m.metalDark, 0.015, 0.015, 0.54, 0, 0.28, 0, 8);
  P.cyl(m.metalDark, 0.16, 0.18, 0.02, 0, 0.01, 0, 20);
  if (withPhone) {
    P.box(m.blackGloss, 0.075, 0.009, 0.15, 0.05, 0.583, 0.02, { rot: 0.4 });
  }
  P.collider(0.48, 0.6, 0.48, 0, 0.3, 0);
  return P.world(0, 0.62, 0);
}

export function bed(b: HouseBuilder, x: number, y: number, z: number, r: number) {
  const P = new Placer(b, x, y, z, r);
  const m = M(b);
  const W = 1.65, L = 2.1;
  P.box(m.woodDark, W + 0.06, 0.28, L, 0, 0.2, 0);
  P.box(m.woodDark, W + 0.12, 1.05, 0.08, 0, 0.53, -L / 2 - 0.02); // cabeceira
  P.box(m.fabricBed, W + 0.0, 0.03, 0.06, 0, 1.0, -L / 2 + 0.03);
  P.geo(cushion(W - 0.04, 0.22, L - 0.06), m.fabricBed, 0, 0.44, 0.0);
  // edredom
  P.geo(cushion(W + 0.04, 0.06, L * 0.62), m.fabricBlanket, 0, 0.56, L * 0.17);
  P.box(m.fabricBlanket, W + 0.06, 0.3, 0.03, 0, 0.42, L / 2 + 0.005);
  // travesseiros
  for (const sx of [-1, 1]) P.geo(cushion(0.62, 0.14, 0.38), m.fabricBed, sx * 0.38, 0.62, -L / 2 + 0.3);
  P.collider(W + 0.12, 0.6, L + 0.08, 0, 0.3, 0);
  P.collider(W + 0.12, 1.1, 0.1, 0, 0.55, -L / 2);
  // criados-mudos
  for (const sx of [-1, 1]) {
    P.box(m.wood, 0.45, 0.5, 0.4, sx * (W / 2 + 0.36), 0.25, -L / 2 + 0.22);
    P.box(m.cabinet, 0.4, 0.15, 0.02, sx * (W / 2 + 0.36), 0.35, -L / 2 + 0.43);
    P.cyl(m.metalDark, 0.07, 0.09, 0.02, sx * (W / 2 + 0.36), 0.51, -L / 2 + 0.2, 16);
    P.cyl(m.metalDark, 0.008, 0.008, 0.3, sx * (W / 2 + 0.36), 0.66, -L / 2 + 0.2, 6);
    P.cyl(m.fabricBed, 0.09, 0.12, 0.16, sx * (W / 2 + 0.36), 0.86, -L / 2 + 0.2, 20, { castShadow: false });
    P.collider(0.45, 0.55, 0.4, sx * (W / 2 + 0.36), 0.27, -L / 2 + 0.22);
  }
  return {
    sleep: P.place(0.32, -0.08),
    exit: P.place(W / 2 + 0.55, 0.35, Math.PI / 2),
    focus: P.world(0, 0.6, 0),
    lamps: [P.world(-(W / 2 + 0.36), 0.86, -L / 2 + 0.2), P.world(W / 2 + 0.36, 0.86, -L / 2 + 0.2)],
  };
}

export function wardrobe(b: HouseBuilder, x: number, y: number, z: number, r: number) {
  const P = new Placer(b, x, y, z, r);
  const m = M(b);
  P.box(m.wood, 1.8, 2.2, 0.6, 0, 1.1, 0);
  for (const i of [-1, 1]) {
    P.box(m.whiteMatte, 0.88, 2.12, 0.02, i * 0.45, 1.1, 0.305);
    P.box(m.handle, 0.02, 0.4, 0.03, i * 0.04, 1.1, 0.33);
  }
  P.collider(1.8, 2.2, 0.6, 0, 1.1, 0);
}

export function kitchenCounter(b: HouseBuilder, x: number, y: number, z: number, r: number, length: number, opts: { sinkAt?: number; stoveAt?: number; uppers?: boolean }) {
  const P = new Placer(b, x, y, z, r);
  const m = M(b);
  const D = 0.62, H = 0.9;
  P.box(m.cabinet, length, H - 0.1, D - 0.04, 0, (H - 0.1) / 2 + 0.08, -0.02);
  P.box(m.blackMatte, length - 0.02, 0.08, D - 0.1, 0, 0.04, -0.05);
  P.box(m.countertop, length + 0.02, 0.04, D, 0, H - 0.02, 0);
  // portas e puxadores
  const n = Math.max(1, Math.round(length / 0.6));
  for (let i = 0; i < n; i++) {
    const cx = -length / 2 + (i + 0.5) * (length / n);
    P.box(m.cabinet, length / n - 0.012, H - 0.2, 0.02, cx, (H - 0.1) / 2 + 0.08, D / 2 - 0.03);
    P.box(m.handle, 0.18, 0.015, 0.025, cx, H - 0.17, D / 2 - 0.005);
  }
  // armários superiores
  if (opts.uppers !== false) {
    P.box(m.whiteMatte, length, 0.7, 0.35, 0, 1.95, -D / 2 + 0.175);
    for (let i = 0; i < n; i++) {
      const cx = -length / 2 + (i + 0.5) * (length / n);
      P.box(m.handle, 0.015, 0.14, 0.02, cx + (length / n) * 0.35, 1.7, -D / 2 + 0.36);
    }
  } else {
    // prateleira aberta de madeira
    P.box(m.wood, length * 0.35, 0.04, 0.26, length * 0.3, 1.75, -D / 2 + 0.13);
    for (let i = 0; i < 4; i++) P.cyl(m.ceramic, 0.04, 0.035, 0.1, length * 0.3 - 0.3 + i * 0.2, 1.82, -D / 2 + 0.13, 14);
  }
  let sink: THREE.Vector3 | undefined, stove: THREE.Vector3 | undefined;
  if (opts.sinkAt !== undefined) {
    P.box(m.steel, 0.62, 0.012, 0.44, opts.sinkAt, H + 0.002, 0.02, { castShadow: false });
    P.box(m.blackMatte, 0.52, 0.01, 0.36, opts.sinkAt, H + 0.006, 0.02, { castShadow: false });
    P.cyl(m.steel, 0.015, 0.015, 0.32, opts.sinkAt, H + 0.16, -0.22, 10);
    P.box(m.steel, 0.025, 0.025, 0.2, opts.sinkAt, H + 0.31, -0.13);
    sink = P.world(opts.sinkAt, H + 0.1, 0.1);
  }
  if (opts.stoveAt !== undefined) {
    P.box(m.blackGloss, 0.62, 0.012, 0.52, opts.stoveAt, H + 0.002, 0.0, { castShadow: false });
    for (const [bx, bz, rr] of [[-0.15, -0.12, 0.08], [0.15, -0.12, 0.06], [-0.15, 0.13, 0.06], [0.15, 0.13, 0.08]]) {
      P.geo(new THREE.TorusGeometry(rr, 0.006, 6, 24).rotateX(Math.PI / 2), m.metalDark, opts.stoveAt + bx, H + 0.012, bz, { castShadow: false });
    }
    // coifa
    P.box(m.steel, 0.7, 0.12, 0.5, opts.stoveAt, 1.62, -0.06);
    P.box(m.steel, 0.25, 0.6, 0.25, opts.stoveAt, 1.95, -0.18);
    // panela
    P.cyl(m.steel, 0.11, 0.1, 0.12, opts.stoveAt - 0.15, H + 0.07, -0.12, 20);
    stove = P.world(opts.stoveAt, H + 0.1, 0.1);
  }
  P.collider(length, H, D, 0, H / 2, 0);
  return {
    sink, stove,
    standAt: (fx: number) => P.place(fx, D / 2 + 0.38, Math.PI),
  };
}

export function fridge(b: HouseBuilder, x: number, y: number, z: number, r: number) {
  const P = new Placer(b, x, y, z, r);
  const m = M(b);
  P.box(m.steel, 0.78, 1.86, 0.7, 0, 0.93, 0);
  P.box(m.blackMatte, 0.76, 0.012, 0.02, 0, 1.28, 0.352);
  P.box(m.handle, 0.025, 0.55, 0.04, -0.3, 1.58, 0.38);
  P.box(m.handle, 0.025, 0.4, 0.04, -0.3, 0.9, 0.38);
  P.box(m.blackGloss, 0.12, 0.08, 0.01, 0.15, 1.55, 0.356);
  P.collider(0.78, 1.86, 0.7, 0, 0.93, 0);
  return { focus: P.world(0, 1.2, 0.4), stand: P.place(0, 0.85, Math.PI) };
}

export function diningTable(b: HouseBuilder, x: number, y: number, z: number, r: number) {
  const P = new Placer(b, x, y, z, r);
  const m = M(b);
  P.box(m.wood, 1.3, 0.04, 0.8, 0, 0.75, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(m.woodDark, 0.05, 0.73, 0.05, sx * 0.58, 0.365, sz * 0.33);
  P.cyl(m.ceramic, 0.12, 0.09, 0.06, 0, 0.8, 0, 20);
  P.collider(1.3, 0.77, 0.8, 0, 0.385, 0);
  const seats: { seat: Placement; exit: Placement; focus: THREE.Vector3 }[] = [];
  for (const sz of [-1, 1]) {
    const [chx, chz] = P.p(0, sz * 0.62);
    const C = new Placer(b, chx, P.y, chz, P.r + (sz > 0 ? Math.PI : 0));
    C.box(m.wood, 0.44, 0.04, 0.44, 0, 0.45, 0);
    for (const sx of [-1, 1]) for (const sz2 of [-1, 1]) C.box(m.woodDark, 0.035, 0.45, 0.035, sx * 0.19, 0.225, sz2 * 0.19);
    C.box(m.wood, 0.44, 0.42, 0.03, 0, 0.7, -0.205);
    C.collider(0.46, 0.9, 0.46, 0, 0.45, 0);
    seats.push({ seat: C.place(0, 0.1), exit: C.place(0, -0.72), focus: C.world(0, 0.5, 0) });
  }
  return { seats };
}

export function toilet(b: HouseBuilder, x: number, y: number, z: number, r: number) {
  const P = new Placer(b, x, y, z, r);
  const m = M(b);
  P.cyl(m.ceramic, 0.17, 0.13, 0.38, 0, 0.19, 0.05, 24);
  P.geo(new THREE.CylinderGeometry(0.2, 0.19, 0.05, 28).scale(1, 1, 1.15), m.ceramic, 0, 0.405, 0.06);
  P.box(m.ceramic, 0.42, 0.38, 0.18, 0, 0.62, -0.2);
  P.box(m.steel, 0.06, 0.015, 0.03, 0.12, 0.82, -0.12);
  P.collider(0.44, 0.8, 0.62, 0, 0.4, -0.02);
  return { seat: P.place(0, 0.03, 0, -0.035), exit: P.place(0, 0.65), focus: P.world(0, 0.45, 0.1) };
}

export function bathSink(b: HouseBuilder, x: number, y: number, z: number, r: number) {
  const P = new Placer(b, x, y, z, r);
  const m = M(b);
  P.box(m.woodDark, 0.9, 0.5, 0.48, 0, 0.55, 0);
  P.box(m.countertop, 0.92, 0.03, 0.5, 0, 0.815, 0);
  P.geo(new THREE.CylinderGeometry(0.2, 0.16, 0.12, 28).scale(1, 1, 0.75), m.ceramic, 0, 0.88, 0.02);
  P.cyl(m.steel, 0.012, 0.012, 0.18, 0, 0.9, -0.17, 8);
  P.box(m.steel, 0.02, 0.02, 0.1, 0, 0.98, -0.13);
  P.box(m.mirror, 0.7, 0.85, 0.02, 0, 1.55, -0.23);
  P.box(m.frame, 0.74, 0.89, 0.015, 0, 1.55, -0.24);
  P.collider(0.92, 0.85, 0.5, 0, 0.42, 0);
  return { focus: P.world(0, 0.95, 0.2), stand: P.place(0, 0.62, Math.PI) };
}

export function shower(b: HouseBuilder, x: number, y: number, z: number, w: number, d: number) {
  const P = new Placer(b, x, y, z, 0);
  const m = M(b);
  P.box(m.whiteMatte, w, 0.06, d, 0, 0.03, 0, { castShadow: false });
  P.box(m.steel, 0.12, 0.005, 0.12, 0, 0.063, 0, { castShadow: false });
  // vidro (lado -z, voltado para o banheiro) com vão de entrada
  const glassGeo = new THREE.BoxGeometry(w * 0.55, 1.95, 0.012);
  P.geo(glassGeo, m.glass, -w * 0.225, 1.03, d / 2, { castShadow: false });
  P.box(m.steel, 0.02, 1.95, 0.03, -w / 2 + w * 0.55 + 0.0, 1.03, d / 2);
  P.box(m.steel, w, 0.02, 0.03, 0, 2.0, d / 2);
  // ducha
  P.cyl(m.steel, 0.012, 0.012, 1.0, w / 2 - 0.1, 1.6, -d / 2 + 0.08, 8);
  P.box(m.steel, 0.02, 0.02, 0.35, w / 2 - 0.1, 2.1, -d / 2 + 0.24);
  P.cyl(m.steel, 0.11, 0.11, 0.015, w / 2 - 0.1, 2.09, -d / 2 + 0.42, 24);
  // colisor do vidro fixo (o vão permite entrar)
  P.collider(w * 0.55, 2, 0.06, -w * 0.225, 1, d / 2);
  return {
    head: P.world(w / 2 - 0.1, 2.08, -d / 2 + 0.42),
    stand: P.place(w / 2 - 0.12, -d / 2 + 0.45, Math.PI * 0.85),
    focus: P.world(0, 1.2, 0),
    exit: P.place(w * 0.3, d / 2 + 0.55, Math.PI),
  };
}

export function ceilingLight(b: HouseBuilder, x: number, y: number, z: number) {
  const P = new Placer(b, x, y, z, 0);
  const m = M(b);
  P.cyl(m.whiteMatte, 0.2, 0.2, 0.05, 0, -0.025, 0, 28, { castShadow: false });
  P.cyl(m.lampGlow, 0.17, 0.17, 0.012, 0, -0.056, 0, 28, { castShadow: false });
  return P.world(0, -0.3, 0);
}
