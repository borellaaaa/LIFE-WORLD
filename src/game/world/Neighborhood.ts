/**
 * Monta o bairro "Rua das Acácias": rua, calçadas, lotes, casa do jogador,
 * casas vizinhas, vegetação e mobiliário urbano.
 *
 * Mundo: X = leste/oeste, Z = norte(-)/sul(+). Rua ao longo de X em z=0.
 * Lotes/calçadas ficam em y = 0.12 (meio-fio); asfalto em y = 0.
 */
import * as THREE from 'three';
import { StaticBatcher, groundPlane } from './geometry';
import type { Materials } from './materials';
import type { Physics } from '../physics/Physics';
import { buildPlayerHouse, type PlayerHouseResult } from './house/PlayerHouse';
import { buildNeighborHouse, type NeighborStyle } from './house/NeighborHouse';
import { HouseFrame } from './house/HouseBuilder';
import { buildTrees, buildBushes, buildHedges, GrassField, type Rect, type TreePlacement } from './vegetation';
import { streetLamp, mailbox, fence, car, streetSign, bench } from './props/street';
import { rand } from './textures';

export const LOT_Y = 0.12;
export const ROAD_HALF = 4.5;
export const WALK_W = 2.6;
export const LOT_DEPTH = 30;
export const WORLD_LIMIT = { x: 78, z: 37.5 };

export interface NeighborhoodResult {
  house: PlayerHouseResult;
  lampHeads: THREE.Vector3[];
  porchLights: THREE.Vector3[];
  grass: GrassField;
  meshes: THREE.Object3D;
}

export function buildNeighborhood(mats: Materials, physics: Physics, scene: THREE.Scene, onStep?: (label: string) => void): NeighborhoodResult {
  const root = new THREE.Group();
  root.name = 'Neighborhood';
  scene.add(root);
  const batch = new StaticBatcher();
  const add = (g: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, opts?: { castShadow?: boolean; receiveShadow?: boolean }) => {
    batch.add(g, mat, new THREE.Matrix4().makeTranslation(x, y, z), { castShadow: false, ...opts });
    g.dispose();
  };

  // --- Terreno, rua e calçadas ---------------------------------------------
  onStep?.('Pavimentando a rua...');
  const FAR = 320;
  const north = -ROAD_HALF - WALK_W, south = ROAD_HALF + WALK_W;
  add(groundPlane(FAR * 2, FAR - ROAD_HALF, 3.2), mats.grass, 0, LOT_Y - 0.002, -(FAR + ROAD_HALF) / 2);
  add(groundPlane(FAR * 2, FAR - ROAD_HALF, 3.2), mats.grass, 0, LOT_Y - 0.002, (FAR + ROAD_HALF) / 2);
  add(groundPlane(FAR * 2, ROAD_HALF * 2, 6), mats.asphalt, 0, 0.0, 0);
  // calçadas
  add(groundPlane(FAR * 2, WALK_W, 2), mats.concrete, 0, LOT_Y + 0.004, north + WALK_W / 2);
  add(groundPlane(FAR * 2, WALK_W, 2), mats.concrete, 0, LOT_Y + 0.004, south - WALK_W / 2);
  // meio-fio
  for (const zz of [-ROAD_HALF, ROAD_HALF]) {
    batch.box(mats.curb, FAR * 2, LOT_Y + 0.02, 0.16, 0, (LOT_Y + 0.02) / 2, zz + Math.sign(zz) * 0.08, 0, { castShadow: false, tile: 2 });
  }
  // sinalização horizontal
  for (let x = -FAR; x < FAR; x += 6) add(groundPlane(3, 0.14), mats.lineYellow, x + 1.5, 0.004, 0);
  for (const zz of [-ROAD_HALF + 0.35, ROAD_HALF - 0.35]) add(groundPlane(FAR * 2, 0.12), mats.lineWhite, 0, 0.004, zz);
  // faixa de pedestres em frente à casa
  for (let i = 0; i < 8; i++) add(groundPlane(0.5, ROAD_HALF * 2 - 1.2), mats.lineWhite, -8.5 + i * 0.95, 0.005, 0);

  // física do chão
  physics.addBox({ x: 0, y: LOT_Y / 2 - 1, z: -(FAR + ROAD_HALF) / 2 }, { x: FAR, y: 1 + LOT_Y / 2, z: (FAR - ROAD_HALF) / 2 });
  physics.addBox({ x: 0, y: LOT_Y / 2 - 1, z: (FAR + ROAD_HALF) / 2 }, { x: FAR, y: 1 + LOT_Y / 2, z: (FAR - ROAD_HALF) / 2 });
  physics.addBox({ x: 0, y: -1, z: 0 }, { x: FAR, y: 1, z: ROAD_HALF });
  // limites do mapa (paredes invisíveis)
  const L = WORLD_LIMIT;
  physics.addBox({ x: 0, y: 5, z: -L.z - 0.5 }, { x: L.x + 1, y: 6, z: 0.5 });
  physics.addBox({ x: 0, y: 5, z: L.z + 0.5 }, { x: L.x + 1, y: 6, z: 0.5 });
  physics.addBox({ x: -L.x - 0.5, y: 5, z: 0 }, { x: 0.5, y: 6, z: L.z + 1 });
  physics.addBox({ x: L.x + 0.5, y: 5, z: 0 }, { x: 0.5, y: 6, z: L.z + 1 });

  // --- Casa do jogador -----------------------------------------------------
  onStep?.('Construindo a casa...');
  const HOUSE_Z = -21;
  const house = buildPlayerHouse(new THREE.Vector3(0, LOT_Y, HOUSE_Z), batch, mats, physics, root);

  // caminho de pedras, entrada de carro e caixa de correio
  const pathZ0 = HOUSE_Z + 6.75, pathZ1 = north;
  add(groundPlane(1.4, pathZ0 - pathZ1 < 0 ? pathZ1 - pathZ0 : pathZ0 - pathZ1, 1.2), mats.pavers, -0.8, LOT_Y + 0.006, (pathZ0 + pathZ1) / 2);
  const drive = { x0: 7.2, x1: 10.8, z0: HOUSE_Z - 3, z1: north };
  add(groundPlane(drive.x1 - drive.x0, drive.z1 - drive.z0, 2), mats.driveway, (drive.x0 + drive.x1) / 2, LOT_Y + 0.005, (drive.z0 + drive.z1) / 2);
  // calçada lateral até a porta da cozinha
  add(groundPlane(0.9, 3.2, 1.2), mats.pavers, 6.75 + 0.15, LOT_Y + 0.006, HOUSE_Z + 2.4);
  mailbox(batch, mats, physics, 1.05, north + 0.35, 0);
  streetSign(root, mats, physics, -12.6, north + 0.6, 'Rua das Acácias');
  // deck nos fundos
  batch.box(mats.wood, 6, 0.12, 3.2, -2.5, LOT_Y + 0.06, HOUSE_Z - 6.2, 0, { tile: 1.2 });
  physics.addBox({ x: -2.5, y: LOT_Y + 0.06, z: HOUSE_Z - 6.2 }, { x: 3, y: 0.06, z: 1.6 });
  bench(batch, mats, physics, -2.5, HOUSE_Z - 7.2, 0);

  // --- Lotes vizinhos ------------------------------------------------------
  onStep?.('Erguendo a vizinhança...');
  const styles: (NeighborStyle & { x: number; side: 1 | -1 })[] = [
    { x: -52, side: -1, seed: 3, wall: 'wallSand', accent: 'cladding', twoStory: true, garageLeft: false },
    { x: -26, side: -1, seed: 5, wall: 'wallExterior', accent: 'brick', twoStory: false, garageLeft: true },
    { x: 26, side: -1, seed: 7, wall: 'wallSage', accent: 'wallExteriorDark', twoStory: true, garageLeft: true },
    { x: 52, side: -1, seed: 9, wall: 'wallExterior', accent: 'cladding', twoStory: false, garageLeft: false },
    { x: -39, side: 1, seed: 11, wall: 'wallTerracotta', accent: 'wallExterior', twoStory: true, garageLeft: true },
    { x: -13, side: 1, seed: 13, wall: 'wallExterior', accent: 'wallExteriorDark', twoStory: true, garageLeft: false },
    { x: 13, side: 1, seed: 15, wall: 'wallBlue', accent: 'cladding', twoStory: false, garageLeft: true },
    { x: 39, side: 1, seed: 17, wall: 'wallSand', accent: 'brick', twoStory: true, garageLeft: false },
  ];
  const exclude: Rect[] = [];
  const porchLights: THREE.Vector3[] = [];
  const treeSpots: TreePlacement[] = [];
  const bushSpots: { x: number; z: number; s?: number }[] = [];
  const hedges: { x0: number; z0: number; x1: number; z1: number; h?: number }[] = [];
  const r = rand(2024);

  for (const st of styles) {
    // casas do lado norte olham para +Z (rua); do lado sul, para -Z
    const zc = st.side < 0 ? north - 14 : south + 14;
    const frame = new HouseFrame(new THREE.Vector3(st.x, LOT_Y, zc), st.side < 0 ? 0 : Math.PI);
    const res = buildNeighborHouse(frame, st, batch, mats, physics, root);
    exclude.push({ x0: res.footprint.x0 - 0.3, x1: res.footprint.x1 + 0.3, z0: res.footprint.z0 - 0.3, z1: res.footprint.z1 + 2.4 * (st.side < 0 ? 1 : 0) });
    if (st.side > 0) exclude[exclude.length - 1].z0 -= 2.4;
    porchLights.push(res.porchLight);
    // entrada de carro do vizinho
    const gx = st.x + (st.garageLeft ? -1 : 1) * (st.side < 0 ? 1 : -1) * 3.5;
    const front = st.side < 0 ? res.footprint.z1 : res.footprint.z0;
    const dz0 = Math.min(front, st.side < 0 ? north : south), dz1 = Math.max(front, st.side < 0 ? north : south);
    add(groundPlane(3.2, dz1 - dz0, 2), mats.driveway, gx, LOT_Y + 0.005, (dz0 + dz1) / 2);
    exclude.push({ x0: gx - 1.7, x1: gx + 1.7, z0: dz0, z1: dz1 });
    // caminho até a porta
    const doorSide = (st.garageLeft ? 1 : -1) * (st.side < 0 ? 1 : -1);
    const px = gx + doorSide * 3.2;
    add(groundPlane(1.2, dz1 - dz0, 1.2), mats.pavers, px, LOT_Y + 0.006, (dz0 + dz1) / 2);
    exclude.push({ x0: px - 0.7, x1: px + 0.7, z0: dz0, z1: dz1 });
    mailbox(batch, mats, physics, px + doorSide * 1.1, st.side < 0 ? north + 0.35 : south - 0.35, st.side < 0 ? 0 : Math.PI);
    // árvores e arbustos do lote
    const backZ = st.side < 0 ? -WORLD_LIMIT.z + 4 : WORLD_LIMIT.z - 4;
    treeSpots.push({ x: st.x - 8 + r() * 3, z: backZ + (r() - 0.5) * 3 });
    treeSpots.push({ x: st.x + 7 + r() * 3, z: backZ + (r() - 0.5) * 3 });
    const frontYardZ = st.side < 0 ? north - 3.5 : south + 3.5;
    treeSpots.push({ x: st.x - doorSide * 8.5, z: frontYardZ - st.side * 1.5, variant: 0 });
    for (let k = 0; k < 4; k++) {
      bushSpots.push({ x: st.x + (k - 1.5) * 1.6 - doorSide * 1.5, z: (st.side < 0 ? res.footprint.z1 : res.footprint.z0) + st.side * -0.9, s: 0.8 });
    }
  }
  // cercas dos fundos e divisas entre quintais (sem duplicar divisas compartilhadas)
  fence(batch, mats, physics, -65, -WORLD_LIMIT.z, 65, -WORLD_LIMIT.z);
  fence(batch, mats, physics, -65, WORLD_LIMIT.z, 65, WORLD_LIMIT.z);
  for (const fx of [-65, -39, -13, 13, 39, 65]) fence(batch, mats, physics, fx, -WORLD_LIMIT.z, fx, HOUSE_Z - 3);
  for (const fx of [-52, -26, 0, 26, 52]) fence(batch, mats, physics, fx, WORLD_LIMIT.z, fx, south + 19);
  // sebes no fim da rua (limites leste/oeste)
  for (const sx of [-1, 1]) {
    hedges.push({ x0: sx * 66, z0: north - 1, x1: sx * 66, z1: -WORLD_LIMIT.z, h: 1.8 });
    hedges.push({ x0: sx * 66, z0: south + 1, x1: sx * 66, z1: WORLD_LIMIT.z, h: 1.8 });
  }

  // --- Vegetação ------------------------------------------------------------
  onStep?.('Plantando árvores...');
  // árvores de calçada (a cada 13 m, evitando entradas)
  for (let x = -60; x <= 60; x += 13) {
    for (const zz of [north + 0.7, south - 0.7]) {
      const xx = x + (zz > 0 ? 6.5 : 0);
      if (exclude.some((e) => xx > e.x0 - 1 && xx < e.x1 + 1 && Math.abs(zz) < 9 && Math.abs((e.z0 + e.z1) / 2) < 30 && e.x1 - e.x0 < 5)) continue;
      if (xx > drive.x0 - 1 && xx < drive.x1 + 1 && zz < 0) continue;
      if (Math.abs(xx + 0.8) < 1.6 && zz < 0) continue;
      treeSpots.push({ x: xx, z: zz, variant: 1, scale: 0.85 });
    }
  }
  // lote do jogador: árvores no quintal e na frente
  treeSpots.push({ x: -9.5, z: HOUSE_Z + 8.2, variant: 2, scale: 1 });
  treeSpots.push({ x: 9.5, z: -33, variant: 0 });
  treeSpots.push({ x: -9.5, z: -32, variant: 2, scale: 1.05 });
  treeSpots.push({ x: 4, z: -34.5, variant: 1 });
  // arbustos na frente da casa
  for (let i = 0; i < 5; i++) bushSpots.push({ x: -5.6 + i * 0.85, z: HOUSE_Z + 5.2, s: 0.75 });
  for (let i = 0; i < 3; i++) bushSpots.push({ x: 2.6 + i * 1.1, z: HOUSE_Z + 5.2, s: 0.7 });
  bushSpots.push({ x: -12, z: north - 1.2 }, { x: 12, z: north - 1.2, s: 0.9 });
  // sebe baixa na frente do lote do jogador (com vãos para caminho e garagem)
  hedges.push({ x0: -12.5, z0: north - 0.55, x1: -2.2, z1: north - 0.55, h: 0.75 });
  hedges.push({ x0: 0.6, z0: north - 0.55, x1: 6.6, z1: north - 0.55, h: 0.75 });

  buildTrees(treeSpots, mats, physics, root);
  buildBushes(bushSpots, mats, physics, root);
  buildHedges(hedges, mats, physics, root);

  // --- Postes e carros -------------------------------------------------------
  onStep?.('Instalando a iluminação pública...');
  const lampHeads: THREE.Vector3[] = [];
  for (let x = -58; x <= 58; x += 29) {
    lampHeads.push(streetLamp(batch, mats, physics, x + 4, north + 0.35, 0));
    lampHeads.push(streetLamp(batch, mats, physics, x - 10, south - 0.35, Math.PI));
  }
  car(root, mats, physics, 9.0, HOUSE_Z + 5.5, Math.PI / 2, mats.carPaint);
  car(root, mats, physics, -30, 2.9, 0, mats.carPaint2);
  car(root, mats, physics, 33, -2.9, Math.PI, mats.carPaint);

  // --- Grama --------------------------------------------------------------
  onStep?.('Cultivando o gramado...');
  const lawns: Rect[] = [
    { x0: -66, x1: 66, z0: -WORLD_LIMIT.z, z1: north - 0.05 },
    { x0: -66, x1: 66, z0: south + 0.05, z1: WORLD_LIMIT.z },
  ];
  exclude.push(
    { x0: -6.4, x1: 6.4, z0: HOUSE_Z - 4.8, z1: HOUSE_Z + 4.8 }, // casa
    { x0: -2.8, x1: 1.2, z0: HOUSE_Z + 4.5, z1: HOUSE_Z + 7 }, // varanda
    { x0: -1.6, x1: 0.0, z0: HOUSE_Z + 6.5, z1: north }, // caminho
    { x0: drive.x0, x1: drive.x1, z0: drive.z0, z1: drive.z1 },
    { x0: 6.0, x1: 7.5, z0: HOUSE_Z + 0.6, z1: HOUSE_Z + 4.2 },
    { x0: -5.6, x1: 0.6, z0: HOUSE_Z - 7.9, z1: HOUSE_Z - 4.5 }, // deck
  );
  const grass = new GrassField(lawns, exclude, root, 6);

  batch.build(root);
  return { house, lampHeads, porchLights, grass, meshes: root };
}
