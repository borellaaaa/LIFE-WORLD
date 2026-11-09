/**
 * Construtor genérico de edificações: paredes com aberturas (portas, janelas,
 * vãos), pisos, forros, telhados planos, esquadrias e colisores.
 *
 * Trabalha em coordenadas locais da casa (x, z) e converte para o mundo
 * via `HouseFrame` (origem + rotação em Y múltipla de 90°).
 */
import * as THREE from 'three';
import { StaticBatcher, groundPlane } from '../geometry';
import { Physics, G } from '../../physics/Physics';
import type { Materials } from '../materials';
import { Door } from '../../interaction/Door';

export class HouseFrame {
  readonly matrix = new THREE.Matrix4();
  constructor(readonly origin: THREE.Vector3, readonly rotY = 0) {
    this.matrix.makeRotationY(rotY).setPosition(origin);
  }
  point(x: number, y: number, z: number) {
    return new THREE.Vector3(x, y, z).applyMatrix4(this.matrix);
  }
  yaw(local: number) {
    return local + this.rotY;
  }
}

export interface Opening {
  /** posição ao longo da parede (m a partir do ponto `a`) */
  start: number;
  end: number;
  bottom: number;
  top: number;
  kind: 'window' | 'door' | 'arch' | 'garage';
  door?: { id: string; name: string; style: 'wood' | 'white'; hingeAtStart?: boolean; exterior?: boolean };
  /** janela iluminada à noite (fachadas sem interior) */
  lit?: boolean;
  mullions?: number;
}

export interface WallSpec {
  a: [number, number];
  b: [number, number];
  thickness?: number;
  height: number;
  /** material do lado +n (n = normal à esquerda de a→b: para a→b em +x, n = +z) */
  matPos: THREE.Material;
  matNeg: THREE.Material;
  openings?: Opening[];
  baseY?: number;
  /** cria rodapé nos lados indicados */
  baseboard?: { pos?: boolean; neg?: boolean };
}

export class HouseBuilder {
  readonly doors: Door[] = [];
  readonly litWindows: THREE.Mesh[] = [];
  private glassBatch = new StaticBatcher();

  constructor(
    readonly frame: HouseFrame,
    readonly batch: StaticBatcher,
    readonly mats: Materials,
    readonly physics: Physics,
    readonly parent: THREE.Object3D,
  ) {}

  /** Caixa em coordenadas locais da casa. */
  box(mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, rotY = 0, opts?: { castShadow?: boolean; receiveShadow?: boolean; roof?: boolean; tile?: number }) {
    this.batch.box(mat, w, h, d, x, y, z, rotY, opts, this.frame.matrix);
  }

  /** Colisor de caixa em coordenadas locais. */
  collider(w: number, h: number, d: number, x: number, y: number, z: number, rotY = 0, group: number = G.WORLD) {
    const c = this.frame.point(x, y, z);
    return this.physics.addBox(c, { x: w / 2, y: h / 2, z: d / 2 }, { rotY: this.frame.yaw(rotY), group });
  }

  wall(spec: WallSpec) {
    const t = spec.thickness ?? 0.2;
    const baseY = spec.baseY ?? 0;
    const [ax, az] = spec.a;
    const [bx, bz] = spec.b;
    const L = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / L, uz = (bz - az) / L;
    const nx = -uz, nz = ux; // normal "positiva": para a→b em +x, n = +z
    const rotY = Math.atan2(-uz, ux);
    const H = spec.height;
    const openings = [...(spec.openings ?? [])].sort((p, q) => p.start - q.start);

    // retângulos sólidos no plano da parede
    const rects: [number, number, number, number][] = []; // s0, s1, y0, y1
    let cursor = 0;
    for (const o of openings) {
      if (o.start > cursor) rects.push([cursor, o.start, 0, H]);
      if (o.top < H) rects.push([o.start, o.end, o.top, H]);
      if (o.bottom > 0) rects.push([o.start, o.end, 0, o.bottom]);
      cursor = Math.max(cursor, o.end);
    }
    if (cursor < L) rects.push([cursor, L, 0, H]);

    const at = (s: number, off: number) => [ax + ux * s + nx * off, az + uz * s + nz * off] as const;

    for (const [s0, s1, y0, y1] of rects) {
      const w = s1 - s0, h = y1 - y0;
      if (w < 1e-3 || h < 1e-3) continue;
      const sm = (s0 + s1) / 2;
      const ym = baseY + (y0 + y1) / 2;
      const [px, pz] = at(sm, t / 4);
      const [qx, qz] = at(sm, -t / 4);
      this.box(spec.matPos, w, h, t / 2, px, ym, pz, rotY);
      this.box(spec.matNeg, w, h, t / 2, qx, ym, qz, rotY);
      const [cx, cz] = at(sm, 0);
      this.collider(w, h, t, cx, ym, cz, rotY);
    }

    // rodapés
    if (spec.baseboard) {
      const bh = 0.08, bt = 0.015;
      let c2 = 0;
      const segs: [number, number][] = [];
      for (const o of openings) {
        if (o.kind === 'door' || o.kind === 'arch' || o.bottom === 0) {
          if (o.start > c2) segs.push([c2, o.start]);
          c2 = Math.max(c2, o.end);
        }
      }
      if (c2 < L) segs.push([c2, L]);
      for (const [s0, s1] of segs) {
        for (const side of [1, -1] as const) {
          if (side === 1 && !spec.baseboard.pos) continue;
          if (side === -1 && !spec.baseboard.neg) continue;
          const [px, pz] = at((s0 + s1) / 2, side * (t / 2 + bt / 2));
          this.box(this.mats.baseboard, s1 - s0, bh, bt, px, baseY + bh / 2, pz, rotY, { castShadow: false });
        }
      }
    }

    // esquadrias
    for (const o of openings) {
      const w = o.end - o.start;
      const sm = (o.start + o.end) / 2;
      if (o.kind === 'window') this.windowAt(at, sm, w, o, baseY, rotY, t);
      if (o.kind === 'door') this.doorAt(at, o, baseY, rotY, t);
      if (o.kind === 'garage') {
        const [cx, cz] = at(sm, 0.02);
        const gh = o.top - o.bottom;
        this.box(this.mats.roofEdge, w, gh, 0.06, cx, baseY + (o.bottom + o.top) / 2, cz, rotY);
        const [gx, gz] = at(sm, 0.055);
        for (let i = 1; i < 6; i++) {
          this.box(this.mats.frame, w - 0.04, 0.015, 0.02, gx, baseY + o.bottom + (gh * i) / 6, gz, rotY, { castShadow: false });
        }
        const [kx, kz] = at(sm, 0);
        this.collider(w, gh, t, kx, baseY + (o.top + o.bottom) / 2, kz, rotY);
      }
      if (o.kind === 'arch') {
        // guarnição simples
        for (const s of [o.start, o.end]) {
          const [cx, cz] = at(s, 0);
          this.box(this.mats.baseboard, 0.04, o.top - o.bottom, t + 0.03, cx, baseY + (o.top + o.bottom) / 2, cz, rotY, { castShadow: false });
        }
      }
    }
  }

  private windowAt(
    at: (s: number, off: number) => readonly [number, number], sm: number, w: number, o: Opening, baseY: number, rotY: number, t: number,
  ) {
    const h = o.top - o.bottom;
    const ym = baseY + (o.bottom + o.top) / 2;
    const fw = 0.055, fd = 0.09;
    const M = this.mats;
    const [cx, cz] = at(sm, 0);
    // moldura
    this.box(M.frame, w, fw, fd, cx, baseY + o.top - fw / 2, cz, rotY);
    this.box(M.frame, w, fw, fd, cx, baseY + o.bottom + fw / 2, cz, rotY);
    for (const s of [o.start + fw / 2, o.end - fw / 2]) {
      const [px, pz] = at(s, 0);
      this.box(M.frame, fw, h, fd, px, ym, pz, rotY);
    }
    const mull = o.mullions ?? (w > 1.7 ? Math.round(w / 1.2) - 1 : 0);
    for (let i = 1; i <= mull; i++) {
      const [px, pz] = at(o.start + (w * i) / (mull + 1), 0);
      this.box(M.frame, 0.04, h, fd * 0.8, px, ym, pz, rotY);
    }
    // vidro (ou painel iluminado em casas de fachada)
    if (o.lit) {
      const geo = new THREE.BoxGeometry(w - fw, h - fw, 0.02);
      const mesh = new THREE.Mesh(geo, M.windowLit);
      mesh.position.copy(this.frame.point(cx, ym, cz));
      mesh.rotation.y = this.frame.yaw(rotY);
      this.parent.add(mesh);
      this.litWindows.push(mesh);
    } else {
      this.glassBatch.box(M.glass, w - fw, h - fw, 0.012, cx, ym, cz, rotY, { castShadow: false, receiveShadow: false }, this.frame.matrix);
    }
    // peitoril externo (lado +n por convenção das paredes externas)
    if (o.bottom > 0.05) {
      const [sx, sz] = at(sm, t / 2 + 0.03);
      this.box(M.curb, w + 0.12, 0.04, 0.1, sx, baseY + o.bottom - 0.02, sz, rotY);
    }
    // colisor do vão (vidro)
    this.collider(w, h, t, cx, ym, cz, rotY);
  }

  private doorAt(at: (s: number, off: number) => readonly [number, number], o: Opening, baseY: number, rotY: number, t: number) {
    const M = this.mats;
    const h = o.top - o.bottom;
    // guarnições (batentes)
    for (const s of [o.start, o.end]) {
      const [px, pz] = at(s, 0);
      this.box(M.doorWhite, 0.05, h + 0.03, t + 0.04, px, baseY + h / 2, pz, rotY, { castShadow: false });
    }
    const [tx, tz] = at((o.start + o.end) / 2, 0);
    this.box(M.doorWhite, o.end - o.start + 0.1, 0.05, t + 0.04, tx, baseY + o.top + 0.015, tz, rotY, { castShadow: false });
    if (!o.door) return;
    const hingeAtStart = o.door.hingeAtStart ?? true;
    const width = o.end - o.start - 0.05;
    const s = hingeAtStart ? o.start + 0.025 : o.end - 0.025;
    const [hx, hz] = at(s, 0);
    const hingeWorld = this.frame.point(hx, baseY + o.bottom, hz);
    const yaw = this.frame.yaw(rotY + (hingeAtStart ? 0 : Math.PI));
    const door = new Door(
      { id: o.door.id, name: o.door.name, hinge: hingeWorld, yaw, width, height: h - 0.01, style: o.door.style, exterior: o.door.exterior },
      M, this.physics, this.parent,
    );
    this.doors.push(door);
  }

  /** Piso retangular (x0..x1, z0..z1) na altura y. */
  floor(mat: THREE.Material, x0: number, x1: number, z0: number, z1: number, y: number, tile = 1) {
    const g = groundPlane(x1 - x0, z1 - z0, tile);
    const m = new THREE.Matrix4().makeTranslation((x0 + x1) / 2, y, (z0 + z1) / 2).premultiply(this.frame.matrix);
    this.batch.add(g, mat, m, { castShadow: false, receiveShadow: true });
    g.dispose();
  }

  /** Forro (plano virado para baixo) — camada do telhado. */
  ceiling(x0: number, x1: number, z0: number, z1: number, y: number) {
    const g = groundPlane(x1 - x0, z1 - z0, 2);
    g.rotateX(Math.PI);
    const m = new THREE.Matrix4().makeTranslation((x0 + x1) / 2, y, (z0 + z1) / 2).premultiply(this.frame.matrix);
    this.batch.add(g, this.mats.ceiling, m, { castShadow: false, receiveShadow: true, roof: true });
    g.dispose();
  }

  /** Laje de cobertura com platibanda. */
  flatRoof(x0: number, x1: number, z0: number, z1: number, y: number, overhang = 0.35, thickness = 0.32) {
    const w = x1 - x0 + overhang * 2, d = z1 - z0 + overhang * 2;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    this.box(this.mats.roofEdge, w, thickness, d, cx, y + thickness / 2, cz, 0, { roof: true });
    this.box(this.mats.roof, w - 0.3, 0.02, d - 0.3, cx, y + thickness + 0.01, cz, 0, { roof: true, castShadow: false, tile: 2 });
    const ph = 0.22, pt = 0.12;
    this.box(this.mats.roofEdge, w, ph, pt, cx, y + thickness + ph / 2, z0 - overhang + pt / 2, 0, { roof: true });
    this.box(this.mats.roofEdge, w, ph, pt, cx, y + thickness + ph / 2, z1 + overhang - pt / 2, 0, { roof: true });
    this.box(this.mats.roofEdge, pt, ph, d, x0 - overhang + pt / 2, y + thickness + ph / 2, cz, 0, { roof: true });
    this.box(this.mats.roofEdge, pt, ph, d, x1 + overhang - pt / 2, y + thickness + ph / 2, cz, 0, { roof: true });
    // colisor do telhado (câmera não atravessa por cima)
    this.collider(w, thickness, d, cx, y + thickness / 2, cz, 0, G.ROOF);
  }

  finish() {
    this.glassBatch.build(this.parent).forEach((m) => (m.renderOrder = 2));
  }
}
