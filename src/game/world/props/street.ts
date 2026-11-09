/**
 * Mobiliário urbano: postes, caixas de correio, cercas, carros e placas.
 */
import * as THREE from 'three';
import type { StaticBatcher } from '../geometry';
import type { Materials } from '../materials';
import { Physics, G } from '../../physics/Physics';

const tmpM = new THREE.Matrix4();
function at(x: number, y: number, z: number, rotY = 0) {
  return tmpM.makeRotationY(rotY).setPosition(x, y, z);
}

/** Poste de luz. Retorna a posição da lâmpada (para o brilho noturno). */
export function streetLamp(batch: StaticBatcher, mats: Materials, physics: Physics, x: number, z: number, facing: number) {
  const y = 0.12;
  batch.add(new THREE.CylinderGeometry(0.1, 0.12, 0.25, 12), mats.metalDark, at(x, y + 0.125, z));
  batch.add(new THREE.CylinderGeometry(0.05, 0.07, 5.2, 10), mats.metalDark, at(x, y + 2.6, z));
  // braço curvo
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, 5.1, 0), new THREE.Vector3(0, 5.75, 0.2), new THREE.Vector3(0, 5.7, 1.25),
  );
  batch.add(new THREE.TubeGeometry(curve, 10, 0.04, 8), mats.metalDark, at(x, y, z, facing));
  const head = new THREE.Matrix4().makeRotationY(facing).setPosition(x, y, z);
  const hp = new THREE.Vector3(0, 5.62, 1.3).applyMatrix4(head);
  batch.add(new THREE.BoxGeometry(0.34, 0.1, 0.6), mats.metalDark, at(hp.x, hp.y + 0.03, hp.z, facing));
  batch.add(new THREE.BoxGeometry(0.28, 0.02, 0.5), mats.lampGlow, at(hp.x, hp.y - 0.025, hp.z, facing), { castShadow: false });
  physics.addCylinder({ x, y: y + 2.6, z }, 2.6, 0.12, G.PROPS);
  return hp;
}

export function mailbox(batch: StaticBatcher, mats: Materials, physics: Physics, x: number, z: number, rotY: number) {
  batch.add(new THREE.BoxGeometry(0.08, 1.0, 0.08), mats.woodDark, at(x, 0.12 + 0.5, z, rotY));
  const body = new THREE.CylinderGeometry(0.15, 0.15, 0.45, 16, 1, false, 0, Math.PI);
  body.rotateZ(Math.PI / 2);
  body.rotateY(Math.PI / 2);
  batch.add(body, mats.mailbox, at(x, 0.12 + 1.02, z, rotY));
  batch.add(new THREE.BoxGeometry(0.3, 0.16, 0.45), mats.mailbox, at(x, 0.12 + 0.94, z, rotY));
  physics.addBox({ x, y: 0.7, z }, { x: 0.18, y: 0.55, z: 0.25 }, { rotY, group: G.PROPS });
}

/** Cerca de ripas horizontais entre dois pontos alinhados a um eixo. */
export function fence(batch: StaticBatcher, mats: Materials, physics: Physics, x0: number, z0: number, x1: number, z1: number, h = 1.6) {
  const dx = x1 - x0, dz = z1 - z0;
  const L = Math.hypot(dx, dz);
  const rot = Math.atan2(-dz, dx);
  const ux = dx / L, uz = dz / L;
  const posts = Math.max(2, Math.ceil(L / 2.4) + 1);
  for (let i = 0; i < posts; i++) {
    const t = (i / (posts - 1)) * L;
    batch.add(new THREE.BoxGeometry(0.09, h + 0.05, 0.09), mats.woodDark, at(x0 + ux * t, 0.12 + (h + 0.05) / 2, z0 + uz * t, rot));
  }
  const slats = 7;
  for (let k = 0; k < slats; k++) {
    const y = 0.12 + 0.12 + k * ((h - 0.2) / (slats - 1));
    const g = new THREE.BoxGeometry(L, 0.12, 0.025);
    // UV em escala de mundo
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L * 0.5, uv.getY(i) * 0.1 + k * 0.13);
    batch.add(g, mats.fenceWood, at((x0 + x1) / 2, y, (z0 + z1) / 2, rot));
  }
  physics.addBox({ x: (x0 + x1) / 2, y: 0.12 + h / 2, z: (z0 + z1) / 2 }, { x: L / 2, y: h / 2, z: 0.06 }, { rotY: rot, group: G.PROPS });
}

/** Carro compacto original (perfil extrudado com chanfros). */
export function car(parent: THREE.Object3D, mats: Materials, physics: Physics, x: number, z: number, rotY: number, paint: THREE.Material) {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  // perfil lateral (comprimento ao longo de X local, frente em +X)
  s.moveTo(-2.05, 0.32);
  s.lineTo(-2.05, 0.72);
  s.quadraticCurveTo(-2.02, 0.88, -1.75, 0.92);
  s.lineTo(-1.25, 0.95);
  s.quadraticCurveTo(-0.95, 1.38, -0.45, 1.42);
  s.lineTo(0.55, 1.42);
  s.quadraticCurveTo(0.95, 1.4, 1.35, 0.98);
  s.lineTo(1.85, 0.88);
  s.quadraticCurveTo(2.1, 0.82, 2.1, 0.6);
  s.lineTo(2.08, 0.32);
  s.lineTo(-2.05, 0.32);
  const body = new THREE.ExtrudeGeometry(s, { depth: 1.62, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 3, curveSegments: 10 });
  body.translate(0, 0, -0.81);
  const bm = new THREE.Mesh(body, paint);
  bm.castShadow = bm.receiveShadow = true;
  g.add(bm);
  // vidros (cabine)
  const w = new THREE.Shape();
  w.moveTo(-1.15, 0.98);
  w.quadraticCurveTo(-0.9, 1.33, -0.45, 1.36);
  w.lineTo(0.5, 1.36);
  w.quadraticCurveTo(0.88, 1.34, 1.24, 0.99);
  w.lineTo(-1.15, 0.98);
  const glass = new THREE.ExtrudeGeometry(w, { depth: 1.66, bevelEnabled: false, curveSegments: 8 });
  glass.translate(0, 0.0, -0.83);
  const gm = new THREE.Mesh(glass, mats.carGlass);
  g.add(gm);
  // colunas
  for (const px of [-0.05]) {
    const pil = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.38, 1.67), paint);
    pil.position.set(px, 1.17, 0);
    g.add(pil);
  }
  // rodas
  const wheelGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 24);
  wheelGeo.rotateX(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.25, 12);
  rimGeo.rotateX(Math.PI / 2);
  for (const wx of [-1.35, 1.3]) {
    for (const wz of [-0.8, 0.8]) {
      const wh = new THREE.Mesh(wheelGeo, mats.tire);
      wh.position.set(wx, 0.33, wz);
      wh.castShadow = true;
      const rim = new THREE.Mesh(rimGeo, mats.steel);
      rim.position.set(wx, 0.33, wz + Math.sign(wz) * 0.005);
      g.add(wh, rim);
    }
  }
  // faróis e lanternas
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.32), mats.lampGlow);
  for (const hz of [-0.58, 0.58]) {
    const h = head.clone();
    h.position.set(2.13, 0.72, hz);
    g.add(h);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.3), new THREE.MeshStandardMaterial({ color: '#7a0d12', emissive: '#3a0306', roughness: 0.3 }));
    tail.position.set(-2.1, 0.78, hz);
    g.add(tail);
  }
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.9), mats.blackMatte);
  grille.position.set(2.14, 0.55, 0);
  g.add(grille);
  g.position.set(x, 0.0, z);
  g.rotation.y = rotY;
  parent.add(g);
  physics.addBox({ x, y: 0.75, z }, { x: 2.1, y: 0.75, z: 0.92 }, { rotY, group: G.PROPS });
  return g;
}

/** Placa de rua com nome (textura em canvas). */
export function streetSign(parent: THREE.Object3D, mats: Materials, physics: Physics, x: number, z: number, name: string) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#1f5a3e';
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = '#f3efe4';
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 496, 112);
  ctx.fillStyle = '#f3efe4';
  ctx.font = 'bold 54px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 256, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 0.03), [
    mats.metalDark, mats.metalDark, mats.metalDark, mats.metalDark,
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }),
  ]);
  plate.position.set(x, 2.7, z);
  plate.castShadow = true;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.9, 10), mats.metalDark);
  pole.position.set(x, 0.12 + 1.45, z);
  pole.castShadow = true;
  parent.add(plate, pole);
  physics.addCylinder({ x, y: 1.5, z }, 1.4, 0.06, G.PROPS);
}

/** Banco de praça. */
export function bench(batch: StaticBatcher, mats: Materials, physics: Physics, x: number, z: number, rotY: number) {
  const m = new THREE.Matrix4().makeRotationY(rotY).setPosition(x, 0.12, z);
  const add = (g: THREE.BufferGeometry, mat: THREE.Material, lx: number, ly: number, lz: number) => {
    g.translate(lx, ly, lz);
    batch.add(g, mat, m);
  };
  for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(1.7, 0.04, 0.12), mats.wood, 0, 0.45, -0.15 + i * 0.14);
  for (let i = 0; i < 2; i++) add(new THREE.BoxGeometry(1.7, 0.12, 0.035), mats.wood, 0, 0.62 + i * 0.16, -0.24);
  for (const sx of [-0.75, 0.75]) {
    add(new THREE.BoxGeometry(0.05, 0.45, 0.4), mats.metalDark, sx, 0.225, 0);
    add(new THREE.BoxGeometry(0.05, 0.45, 0.04), mats.metalDark, sx, 0.67, -0.24);
  }
  physics.addBox({ x, y: 0.5, z }, { x: 0.9, y: 0.45, z: 0.3 }, { rotY, group: G.PROPS });
}
