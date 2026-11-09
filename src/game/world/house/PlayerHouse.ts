/**
 * Casa do jogador: térreo moderno com sala, cozinha, quarto e banheiro.
 *
 * Coordenadas locais: x ∈ [-6, 6], z ∈ [-4.5, 4.5], frente (rua) em +Z.
 * Piso interno a 0.15 m acima da origem da casa.
 *
 *   z=-4.5  ┌───────────────┬──────────┐
 *           │    QUARTO     │ BANHEIRO │
 *   z=0     ├────────[p]────┼─[p]──────┤
 *           │     SALA      ⌒  COZINHA [p] (porta lateral)
 *   z=+4.5  └──────[porta]──┴──────────┘
 *          x=-6            x=2        x=6
 */
import * as THREE from 'three';
import { HouseBuilder, HouseFrame, type WallSpec } from './HouseBuilder';
import type { StaticBatcher } from '../geometry';
import type { Materials } from '../materials';
import type { Physics } from '../../physics/Physics';
import { G } from '../../physics/Physics';
import type { Interactable, InteractionAction, InteractionContext } from '../../interaction/types';
import type { ActivityDef, Placement } from '../../sim/activities';
import * as F from '../props/furniture';
import type { Door } from '../../interaction/Door';

export const FLOOR = 0.15;
export const WALL_H = 2.9;

export interface Room {
  name: string;
  box: THREE.Box3;
}

export interface PlayerHouseResult {
  doors: Door[];
  interactables: Interactable[];
  lights: THREE.PointLight[];
  rooms: Room[];
  interior: THREE.Box3;
  spawn: Placement;
  frontDoorOutside: THREE.Vector3;
  update: (dt: number, time: number) => void;
}

const simple = (
  id: string, name: string, position: THREE.Vector3, radius: number,
  actions: (ctx: InteractionContext) => InteractionAction[],
): Interactable => ({ id, name, position, radius, actions });

export function buildPlayerHouse(
  origin: THREE.Vector3, batch: StaticBatcher, mats: Materials, physics: Physics, parent: THREE.Object3D,
): PlayerHouseResult {
  const frame = new HouseFrame(origin, 0);
  const B = new HouseBuilder(frame, batch, mats, physics, parent);
  const m = mats;
  const H = WALL_H;
  const wall = (spec: Omit<WallSpec, 'height'> & { height?: number }) => B.wall({ baseY: FLOOR, ...spec, height: spec.height ?? H });

  // --- Fundação / piso -------------------------------------------------------
  B.box(m.foundation, 12.3, FLOOR, 9.3, 0, FLOOR / 2, 0, 0, { tile: 2 });
  B.collider(12.3, FLOOR, 9.3, 0, FLOOR / 2, 0);
  // varanda de entrada + degrau
  B.box(m.concrete, 3.6, FLOOR, 1.7, -0.8, FLOOR / 2, 5.45, 0, { tile: 2 });
  B.collider(3.6, FLOOR, 1.7, -0.8, FLOOR / 2, 5.45);
  B.box(m.concrete, 2.2, FLOOR / 2, 0.45, -0.8, FLOOR / 4, 6.52, 0, { tile: 2 });
  B.collider(2.2, FLOOR / 2, 0.45, -0.8, FLOOR / 4, 6.52);
  // degrau da porta lateral
  B.box(m.concrete, 0.9, FLOOR, 1.6, 6.55, FLOOR / 2, 2.4, 0, { tile: 2 });
  B.collider(0.9, FLOOR, 1.6, 6.55, FLOOR / 2, 2.4);

  // --- Paredes externas -----------------------------------------------------
  // Frente (z = +4.5): reboco branco | ripado de madeira na entrada | volume escuro da cozinha
  wall({
    a: [-6.1, 4.5], b: [-2.1, 4.5], matPos: m.wallExterior, matNeg: m.paintLiving, baseboard: { neg: true },
    openings: [{ start: 0.8, end: 3.8, bottom: 0.45, top: 2.45, kind: 'window', mullions: 2 }],
  });
  wall({
    a: [-2.1, 4.5], b: [2, 4.5], matPos: m.cladding, matNeg: m.paintLiving, baseboard: { neg: true },
    openings: [
      { start: 0.8, end: 1.8, bottom: 0, top: 2.2, kind: 'door', door: { id: 'door-front', name: 'Porta de entrada', style: 'wood', hingeAtStart: true, exterior: true } },
      { start: 2.4, end: 3.4, bottom: 0.3, top: 2.45, kind: 'window', mullions: 0 },
    ],
  });
  wall({
    a: [2, 4.5], b: [6.1, 4.5], matPos: m.wallExteriorDark, matNeg: m.paintKitchen,
    openings: [{ start: 1.0, end: 3.2, bottom: 1.05, top: 2.25, kind: 'window', mullions: 1 }],
  });
  // Fundos (z = -4.5), percorrida em -X para o lado externo ser +n
  wall({
    a: [6.1, -4.5], b: [2, -4.5], matPos: m.wallExterior, matNeg: m.tileBath,
    openings: [{ start: 1.3, end: 2.5, bottom: 1.5, top: 2.2, kind: 'window', mullions: 0 }],
  });
  wall({
    a: [2, -4.5], b: [-6.1, -4.5], matPos: m.wallExterior, matNeg: m.paintBedroom, baseboard: { neg: true },
    openings: [{ start: 0.4, end: 2.6, bottom: 0.8, top: 2.3, kind: 'window', mullions: 1 }],
  });
  // Lateral esquerda (x = -6)
  wall({
    a: [-6, -4.4], b: [-6, 0], matPos: m.wallExterior, matNeg: m.paintBedroom, baseboard: { neg: true },
    openings: [{ start: 1.0, end: 2.6, bottom: 0.9, top: 2.2, kind: 'window', mullions: 0 }],
  });
  wall({ a: [-6, 0], b: [-6, 4.4], matPos: m.wallExterior, matNeg: m.paintAccent, baseboard: { neg: true } });
  // Lateral direita (x = +6)
  wall({
    a: [6, 4.4], b: [6, 0], matPos: m.wallExteriorDark, matNeg: m.paintKitchen,
    openings: [{ start: 1.5, end: 2.5, bottom: 0, top: 2.2, kind: 'door', door: { id: 'door-side', name: 'Porta lateral', style: 'white', hingeAtStart: true, exterior: true } }],
  });
  wall({ a: [6, 0], b: [6, -4.4], matPos: m.wallExterior, matNeg: m.tileBath });

  // --- Paredes internas -----------------------------------------------------
  wall({
    a: [-5.9, 0], b: [2, 0], matPos: m.paintLiving, matNeg: m.paintBedroom, thickness: 0.14, baseboard: { pos: true, neg: true },
    openings: [{ start: 6.4, end: 7.3, bottom: 0, top: 2.1, kind: 'door', door: { id: 'door-bedroom', name: 'Porta do quarto', style: 'white', hingeAtStart: false } }],
  });
  wall({
    a: [2, 0], b: [5.9, 0], matPos: m.paintKitchen, matNeg: m.tileBath, thickness: 0.14,
    openings: [{ start: 0.35, end: 1.15, bottom: 0, top: 2.1, kind: 'door', door: { id: 'door-bath', name: 'Porta do banheiro', style: 'white', hingeAtStart: true } }],
  });
  wall({
    a: [2, 0.07], b: [2, 4.4], matPos: m.paintLiving, matNeg: m.paintKitchen, thickness: 0.14,
    openings: [{ start: 0.8, end: 3.3, bottom: 0, top: 2.4, kind: 'arch' }],
  });
  wall({ a: [2, -4.4], b: [2, -0.07], matPos: m.paintBedroom, matNeg: m.tileBath, thickness: 0.14, baseboard: { pos: true } });

  // --- Pisos, forros e cobertura -------------------------------------------
  B.floor(m.floorWood, -6, 2, 0, 4.5, FLOOR + 0.002, 2.4);
  B.floor(m.floorKitchen, 2, 6, 0, 4.5, FLOOR + 0.002, 1.2);
  B.floor(m.floorWood, -6, 2, -4.5, 0, FLOOR + 0.002, 2.4);
  B.floor(m.floorBath, 2, 6, -4.5, 0, FLOOR + 0.002, 1.2);
  const ceilY = FLOOR + H;
  B.ceiling(-6, 6, -4.5, 4.5, ceilY - 0.001);
  B.flatRoof(-6.1, 6.1, -4.6, 4.6, ceilY);
  // marquise sobre a varanda
  B.box(m.roofEdge, 3.9, 0.16, 1.9, -0.8, ceilY + 0.08 - 0.25, 5.5, 0, { roof: false });
  B.collider(3.9, 0.16, 1.9, -0.8, ceilY - 0.17, 5.5, 0, G.ROOF);

  // --- Mobiliário -------------------------------------------------------------
  const tv = F.tvUnit(B, -5.65, FLOOR, 2.3, Math.PI / 2);
  const sofa = F.sofa(B, -2.6, FLOOR, 2.3, -Math.PI / 2);
  F.coffeeTable(B, -4.05, FLOOR, 2.3, Math.PI / 2);
  F.rug(B, -3.9, FLOOR + 0.003, 2.3, 3.0, 2.6, m.fabricRug);
  const phonePos = F.sideTable(B, -2.6, FLOOR, 3.85, true);
  const floorLampPos = F.floorLamp(B, -5.55, FLOOR, 4.05);
  F.plant(B, -5.5, FLOOR, 0.55, 1.1);
  F.plant(B, 1.55, FLOOR, 4.0, 0.9);
  const shelf = F.bookshelf(B, -4.55, FLOOR, 0.3, 0);
  const arm = F.armchair(B, -3.25, FLOOR, 1.05, 0.35);
  const pc = F.desk(B, -1.2, FLOOR, 0.46, 0);

  const counter = F.kitchenCounter(B, 3.95, FLOOR, 4.07, Math.PI, 3.6, { sinkAt: -0.15, stoveAt: 1.25, uppers: false });
  const fridge = F.fridge(B, 5.5, FLOOR, 0.52, -Math.PI / 2);
  const dining = F.diningTable(B, 3.75, FLOOR, 2.3, 0);

  const bed = F.bed(B, -2.8, FLOOR, -3.3, 0);
  F.wardrobe(B, -4.6, FLOOR, -0.42, Math.PI);
  F.rug(B, -2.8, FLOOR + 0.003, -1.75, 2.3, 1.2, m.fabricRugBed);
  F.plant(B, 1.55, FLOOR, -3.95, 0.8);

  const showerR = F.shower(B, 5.3, FLOOR, -3.8, 1.2, 1.2);
  const wc = F.toilet(B, 5.6, FLOOR, -1.55, -Math.PI / 2);
  const bsink = F.bathSink(B, 2.42, FLOOR, -2.4, Math.PI / 2);

  // luminárias de teto
  const lampSpots = [[-3, 2.25], [4, 2.25], [-2.8, -2.2], [4, -2.2]].map(([x, z]) => F.ceilingLight(B, x, ceilY, z));
  B.finish();

  // --- Luzes internas (acendem à noite) ------------------------------------
  const lights: THREE.PointLight[] = [];
  for (const p of lampSpots) {
    const l = new THREE.PointLight('#ffd9a8', 0, 9, 1.6);
    l.position.copy(p);
    parent.add(l);
    lights.push(l);
  }
  const lampLight = new THREE.PointLight('#ffcf94', 0, 4.5, 1.8);
  lampLight.position.copy(floorLampPos);
  parent.add(lampLight);
  lights.push(lampLight);
  const porch = new THREE.PointLight('#ffd7a0', 0, 7, 1.8);
  porch.position.copy(frame.point(-0.8, ceilY - 0.45, 5.6));
  parent.add(porch);
  lights.push(porch);

  // --- Efeitos: telas e água do chuveiro ---------------------------------
  const tvMat = tv.screen.material as THREE.MeshStandardMaterial;
  const pcMat = pc.screen.material as THREE.MeshStandardMaterial;
  let tvOn = false, pcOn = false, showerOn = false;
  const water = makeShowerWater(showerR.head);
  water.visible = false;
  parent.add(water);

  // --- Interações -------------------------------------------------------------
  const I: Interactable[] = [];
  const act = (d: ActivityDef): ActivityDef => d;

  I.push(simple('tv', 'TV', tv.focus, 3.2, () => [{
    key: 'E', label: 'Assistir TV', hint: 'Diversão',
    run: (ctx) => ctx.startActivity(act({
      id: 'watch-tv', label: 'Assistindo TV', icon: 'tv', pose: 'Sit', anchor: sofa.seat(0), exit: sofa.front(0),
      effects: { fun: 30, energy: 1 }, stopWhenFull: 'fun',
      onStart: () => (tvOn = true), onEnd: () => (tvOn = false),
    })),
  }]));
  I.push(simple('sofa', 'Sofá', sofa.focus, 1.8, () => [{
    key: 'E', label: 'Sentar e relaxar', hint: 'Energia + Diversão',
    run: (ctx) => ctx.startActivity(act({
      id: 'sofa-relax', label: 'Relaxando no sofá', icon: 'sofa', pose: 'Sit', anchor: sofa.seat(1), exit: sofa.front(1),
      effects: { fun: 9, energy: 6 },
    })),
  }]));
  I.push(simple('armchair', 'Poltrona de leitura', arm.focus, 1.6, () => [{
    key: 'E', label: 'Ler um livro', hint: 'Diversão',
    run: (ctx) => ctx.startActivity(act({
      id: 'read', label: 'Lendo um livro', icon: 'book', pose: 'Sit', anchor: arm.seat, exit: arm.front,
      effects: { fun: 18 }, stopWhenFull: 'fun',
    })),
  }]));
  I.push(simple('bookshelf', 'Estante', shelf.focus, 1.6, () => [{
    key: 'E', label: 'Escolher um livro', hint: 'Diversão',
    run: (ctx) => ctx.startActivity(act({
      id: 'browse-books', label: 'Escolhendo um livro', icon: 'book', pose: 'Use', anchor: shelf.front, durationMin: 10,
      effects: { fun: 24 },
    })),
  }]));
  I.push(simple('phone', 'Telefone', phonePos, 1.6, () => [{
    key: 'E', label: 'Ligar para um amigo', hint: 'Social • 30 min',
    run: (ctx) => ctx.startActivity(act({
      id: 'phone-call', label: 'Conversando ao telefone', icon: 'phone', pose: 'Phone',
      anchor: { position: phonePos.clone().setY(origin.y + FLOOR).add(new THREE.Vector3(-0.6, 0, 0)), yaw: -Math.PI / 2 },
      durationMin: 30, effects: { social: 110, fun: 10 },
      endText: 'Boa conversa! Social +',
    })),
  }]));
  I.push(simple('computer', 'Computador', pc.focus, 1.7, () => [
    {
      key: 'E', label: 'Trabalhar (freelance)', hint: '+$28/h',
      run: (ctx) => ctx.startActivity(act({
        id: 'pc-work', label: 'Trabalhando no computador', icon: 'work', pose: 'SitUse', anchor: pc.seat, exit: pc.exit,
        effects: { fun: -7, energy: -3 }, moneyPerHour: 28,
        onStart: () => (pcOn = true), onEnd: () => (pcOn = false),
      })),
    },
    {
      key: 'F', label: 'Jogar no computador', hint: 'Diversão',
      run: (ctx) => ctx.startActivity(act({
        id: 'pc-play', label: 'Jogando no computador', icon: 'game', pose: 'SitUse', anchor: pc.seat, exit: pc.exit,
        effects: { fun: 34, energy: -2 }, stopWhenFull: 'fun',
        onStart: () => (pcOn = true), onEnd: () => (pcOn = false),
      })),
    },
  ]));
  I.push(simple('fridge', 'Geladeira', fridge.focus, 1.7, (ctx) => [{
    key: 'E', label: 'Fazer um lanche', hint: '-$6 • 15 min', disabled: ctx.money() < 6,
    run: (c) => c.startActivity(act({
      id: 'snack', label: 'Fazendo um lanche', icon: 'food', pose: 'Use', anchor: fridge.stand,
      durationMin: 15, cost: 6, effects: { hunger: 120 },
    })),
  }]));
  if (counter.stove) {
    I.push(simple('stove', 'Fogão', counter.stove, 1.6, (ctx) => [{
      key: 'E', label: 'Cozinhar uma refeição', hint: '-$14 • 50 min', disabled: ctx.money() < 14,
      run: (c) => c.startActivity(act({
        id: 'cook', label: 'Cozinhando e comendo', icon: 'cook', pose: 'Use', anchor: counter.standAt(1.25),
        durationMin: 50, cost: 14, effects: { hunger: 96, fun: 6 },
        endText: 'Refeição caprichada!',
      })),
    }]));
  }
  if (counter.sink) {
    I.push(simple('kitchen-sink', 'Pia da cozinha', counter.sink, 1.5, () => [{
      key: 'E', label: 'Beber um copo d\'água', hint: '5 min',
      run: (c) => c.startActivity(act({
        id: 'water', label: 'Bebendo água', icon: 'water', pose: 'Use', anchor: counter.standAt(-0.15),
        durationMin: 5, effects: { hunger: 40 },
      })),
    }]));
  }
  dining.seats.forEach((s, i) => I.push(simple(`dining-${i}`, 'Cadeira', s.focus, 1.3, () => [{
    key: 'E', label: 'Sentar', run: (c) => c.startActivity(act({
      id: 'sit-chair', label: 'Sentado à mesa', icon: 'chair', pose: 'Sit', anchor: s.seat, exit: s.exit, effects: { energy: 2 },
    })),
  }])));
  I.push(simple('bed', 'Cama', bed.focus, 2.0, () => [
    {
      key: 'E', label: 'Dormir', hint: 'Energia • tempo acelerado',
      run: (c) => c.startActivity(act({
        id: 'sleep', label: 'Dormindo', icon: 'sleep', pose: 'Sleep', anchor: bed.sleep, exit: bed.exit,
        effects: { energy: 17, hunger: 2.5, fun: 4.8, social: 2 }, stopWhenFull: 'energy', timeScale: 14,
        endText: 'Bom dia! Energia recuperada.',
      })),
    },
    {
      key: 'F', label: 'Cochilar (1 h)', hint: 'Energia',
      run: (c) => c.startActivity(act({
        id: 'nap', label: 'Cochilando', icon: 'sleep', pose: 'Sleep', anchor: bed.sleep, exit: bed.exit,
        durationMin: 60, effects: { energy: 16, fun: 4.8 }, timeScale: 6,
      })),
    },
  ]));
  I.push(simple('shower', 'Chuveiro', showerR.focus, 1.8, () => [{
    key: 'E', label: 'Tomar banho', hint: 'Higiene • 20 min',
    run: (c) => c.startActivity(act({
      id: 'shower', label: 'Tomando banho', icon: 'shower', pose: 'Idle', anchor: showerR.stand, exit: showerR.exit,
      durationMin: 20, effects: { hygiene: 260, energy: 4 },
      onStart: () => (showerOn = true), onEnd: () => (showerOn = false),
    })),
  }]));
  I.push(simple('toilet', 'Vaso sanitário', wc.focus, 1.4, () => [{
    key: 'E', label: 'Usar o banheiro', hint: '8 min',
    run: (c) => c.startActivity(act({
      id: 'toilet', label: 'Usando o banheiro', icon: 'toilet', pose: 'Sit', anchor: wc.seat, exit: wc.exit,
      durationMin: 8, effects: { hygiene: 15 },
    })),
  }]));
  I.push(simple('bath-sink', 'Pia do banheiro', bsink.focus, 1.4, () => [{
    key: 'E', label: 'Lavar o rosto', hint: 'Higiene • 5 min',
    run: (c) => c.startActivity(act({
      id: 'wash-face', label: 'Lavando o rosto', icon: 'water', pose: 'Use', anchor: bsink.stand,
      durationMin: 5, effects: { hygiene: 140 },
    })),
  }]));

  const rooms: Room[] = [
    { name: 'Sala', box: new THREE.Box3(frame.point(-6, 0, 0), frame.point(2, 3, 4.5)) },
    { name: 'Cozinha', box: new THREE.Box3(frame.point(2, 0, 0), frame.point(6, 3, 4.5)) },
    { name: 'Quarto', box: new THREE.Box3(frame.point(-6, 0, -4.5), frame.point(2, 3, 0)) },
    { name: 'Banheiro', box: new THREE.Box3(frame.point(2, 0, -4.5), frame.point(6, 3, 0)) },
  ];

  const tmpColor = new THREE.Color();
  return {
    doors: B.doors,
    interactables: [...B.doors, ...I],
    lights,
    rooms,
    interior: new THREE.Box3(frame.point(-6.05, -0.5, -4.55), frame.point(6.05, 3.4, 4.55)),
    spawn: { position: frame.point(-0.8, FLOOR, 7.6), yaw: Math.PI },
    frontDoorOutside: frame.point(-0.8, FLOOR, 6.0),
    update: (dt, time) => {
      // TV: cores mudando como uma programação
      if (tvOn) {
        const t = time * 0.6;
        tmpColor.setHSL((Math.sin(t * 0.37) * 0.5 + 0.5) * 0.7, 0.55, 0.45 + 0.1 * Math.sin(t * 3.1));
        tvMat.emissive.copy(tmpColor);
        tvMat.emissiveIntensity = 1.4;
      } else tvMat.emissiveIntensity = 0;
      if (pcOn) {
        pcMat.emissive.set('#5fa8d3');
        pcMat.emissiveIntensity = 1.1 + 0.08 * Math.sin(time * 9);
      } else pcMat.emissiveIntensity = 0;
      water.visible = showerOn;
      if (showerOn) (water.material as THREE.ShaderMaterial).uniforms.uTime.value += dt;
    },
  };
}

/** Água do chuveiro: linhas que caem em loop (shader barato). */
function makeShowerWater(head: THREE.Vector3) {
  const count = 160;
  const pos = new Float32Array(count * 2 * 3);
  const seeds = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.11;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    pos.set([x, 0, z, x * 1.6, -0.12, z * 1.6], i * 6);
    seeds[i * 2] = seeds[i * 2 + 1] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      varying float vA;
      void main() {
        float t = fract(uTime * 1.6 + aSeed);
        vec3 p = position;
        p.xz *= 1.0 + t * 2.2;
        p.y += -t * 1.95;
        vA = 1.0 - t;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() { gl_FragColor = vec4(0.82, 0.9, 1.0, 0.45 * vA); }`,
  });
  const lines = new THREE.LineSegments(g, mat);
  lines.position.copy(head).add(new THREE.Vector3(0, -0.02, 0));
  lines.frustumCulled = false;
  return lines;
}
