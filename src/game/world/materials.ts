/**
 * Biblioteca de materiais PBR do mundo. Cada material tem um nome estável
 * (usado pelo agrupador de geometria estática para reduzir draw calls).
 */
import * as THREE from 'three';
import { TextureFactory, type TexSet } from './textures';

function std(name: string, params: THREE.MeshStandardMaterialParameters, tex?: TexSet) {
  const p: THREE.MeshStandardMaterialParameters = { ...params };
  if (tex?.map) p.map = tex.map;
  if (tex?.normalMap) p.normalMap = tex.normalMap;
  if (tex?.roughnessMap) p.roughnessMap = tex.roughnessMap;
  const m = new THREE.MeshStandardMaterial(p);
  m.name = name;
  return m;
}

export function createMaterials(tf: TextureFactory) {
  const plaster = tf.plaster();
  const fabric = tf.fabric();
  const M = {
    // Exterior / urbano
    grass: std('grass', { color: '#ffffff', roughness: 1 }, tf.grass()),
    asphalt: std('asphalt', { color: '#ffffff', roughness: 1 }, tf.asphalt()),
    concrete: std('concrete', { color: '#ffffff', roughness: 1 }, tf.concrete()),
    curb: std('curb', { color: '#a8a49c', roughness: 0.9 }, { map: plaster.map, normalMap: plaster.normalMap }),
    lineWhite: std('lineWhite', { color: '#e9e6dd', roughness: 0.7 }),
    lineYellow: std('lineYellow', { color: '#e0b63a', roughness: 0.7 }),
    pavers: std('pavers', { color: '#ffffff', roughness: 1 }, tf.pavers()),
    driveway: std('driveway', { color: '#d6d2ca', roughness: 1 }, tf.concrete()),

    // Construção
    wallExterior: std('wallExterior', { color: '#f1eee8', roughness: 1 }, plaster),
    wallExteriorDark: std('wallExteriorDark', { color: '#3b3f44', roughness: 1 }, plaster),
    wallSand: std('wallSand', { color: '#e3d3b8', roughness: 1 }, plaster),
    wallSage: std('wallSage', { color: '#a9b8a2', roughness: 1 }, plaster),
    wallTerracotta: std('wallTerracotta', { color: '#c98e6c', roughness: 1 }, plaster),
    wallBlue: std('wallBlue', { color: '#9fb3c4', roughness: 1 }, plaster),
    brick: std('brick', { color: '#ffffff', roughness: 1 }, tf.brick()),
    cladding: std('cladding', { color: '#ffffff', roughness: 1 }, tf.woodCladding()),
    foundation: std('foundation', { color: '#8c8a86', roughness: 0.95 }, { map: plaster.map, normalMap: plaster.normalMap }),
    roof: std('roof', { color: '#ffffff', roughness: 1 }, tf.roofing()),
    roofEdge: std('roofEdge', { color: '#2e3135', roughness: 0.6, metalness: 0.3 }),
    ceiling: std('ceiling', { color: '#f4f2ee', roughness: 1 }, { map: plaster.map }),

    // Interior
    paintLiving: std('paintLiving', { color: '#e3d6c3', roughness: 1 }, plaster),
    paintAccent: std('paintAccent', { color: '#5f7f7b', roughness: 1 }, plaster),
    paintKitchen: std('paintKitchen', { color: '#e9e6dc', roughness: 1 }, plaster),
    paintBedroom: std('paintBedroom', { color: '#b4c3d1', roughness: 1 }, plaster),
    tileBath: std('tileBath', { color: '#ffffff', roughness: 1 }, tf.tiles('bathwall', '#f4f4f1', '#e7e6e2', 8, '#cfcac0', 0.004)),
    floorWood: std('floorWood', { color: '#ffffff', roughness: 1 }, tf.woodFloor('oak')),
    floorKitchen: std('floorKitchen', { color: '#ffffff', roughness: 1 }, tf.tiles('kitchen', '#cfcbc4', '#bdb8b0', 2, '#a29d94', 0.004)),
    floorBath: std('floorBath', { color: '#ffffff', roughness: 1 }, tf.tiles('bath', '#9aa3a6', '#8a9396', 4, '#d9d6cf', 0.004)),
    baseboard: std('baseboard', { color: '#f5f3ef', roughness: 0.6 }),

    // Esquadrias
    frame: std('frame', { color: '#2b2e33', roughness: 0.45, metalness: 0.6 }),
    doorWood: std('doorWood', { color: '#ffffff', roughness: 1 }, tf.woodFloor('walnut')),
    doorWhite: std('doorWhite', { color: '#f2f0eb', roughness: 0.55 }),
    handle: std('handle', { color: '#c9c6bf', roughness: 0.25, metalness: 1 }),
    glass: new THREE.MeshPhysicalMaterial({
      name: 'glass', color: '#b9d3df', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.22,
      envMapIntensity: 1.6, depthWrite: false, side: THREE.DoubleSide,
    }),
    windowLit: std('windowLit', { color: '#2a3036', roughness: 0.1, emissive: '#ffc77a', emissiveIntensity: 0 }),

    // Mobiliário
    wood: std('wood', { color: '#ffffff', roughness: 1 }, tf.woodFloor('oak')),
    woodDark: std('woodDark', { color: '#ffffff', roughness: 1 }, tf.woodFloor('walnut')),
    fabricSofa: std('fabricSofa', { color: '#7d8b93', roughness: 1 }, fabric),
    fabricCushion: std('fabricCushion', { color: '#d9a35b', roughness: 1 }, fabric),
    fabricBed: std('fabricBed', { color: '#f1efe9', roughness: 1 }, fabric),
    fabricBlanket: std('fabricBlanket', { color: '#3f5f73', roughness: 1 }, fabric),
    fabricRug: std('fabricRug', { color: '#b9ad97', roughness: 1 }, fabric),
    fabricRugBed: std('fabricRugBed', { color: '#8e9aa6', roughness: 1 }, fabric),
    whiteGloss: std('whiteGloss', { color: '#f4f4f2', roughness: 0.25 }),
    whiteMatte: std('whiteMatte', { color: '#ecebe7', roughness: 0.7 }),
    steel: std('steel', { color: '#c4c7ca', roughness: 0.3, metalness: 0.9 }),
    blackMatte: std('blackMatte', { color: '#1d1f22', roughness: 0.55 }),
    blackGloss: std('blackGloss', { color: '#0f1012', roughness: 0.28, metalness: 0.1 }),
    countertop: std('countertop', { color: '#ffffff', roughness: 1 }, tf.stone()),
    cabinet: std('cabinet', { color: '#3f5452', roughness: 0.6 }),
    ceramic: std('ceramic', { color: '#fbfbf9', roughness: 0.12 }),
    mirror: std('mirror', { color: '#dfe6ea', roughness: 0.02, metalness: 1 }),
    potTerracotta: std('potTerracotta', { color: '#b8693f', roughness: 0.9 }),
    plantLeaf: std('plantLeaf', { color: '#3f6e35', roughness: 0.7, side: THREE.DoubleSide }),
    soil: std('soil', { color: '#3a2a1e', roughness: 1 }),
    books: std('books', { color: '#ffffff', roughness: 0.8, vertexColors: true }),
    screenOff: std('screenOff', { color: '#0b0c0e', roughness: 0.15, metalness: 0.4 }),

    // Exterior: vegetação e mobiliário urbano
    bark: std('bark', { color: '#ffffff', roughness: 1 }, tf.bark()),
    foliage: std('foliage', { color: '#ffffff', roughness: 0.85, vertexColors: true }, tf.foliage()),
    hedge: std('hedge', { color: '#6f8d55', roughness: 0.9, vertexColors: true }, tf.foliage()),
    fenceWood: std('fenceWood', { color: '#ffffff', roughness: 1 }, tf.woodCladding()),
    metalDark: std('metalDark', { color: '#33373c', roughness: 0.5, metalness: 0.7 }),
    lampGlow: std('lampGlow', { color: '#fff3d6', roughness: 0.3, emissive: '#ffd59a', emissiveIntensity: 0 }),
    carPaint: new THREE.MeshPhysicalMaterial({ name: 'carPaint', color: '#8b1e2b', roughness: 0.32, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.08 }),
    carPaint2: new THREE.MeshPhysicalMaterial({ name: 'carPaint2', color: '#d7dbe0', roughness: 0.3, metalness: 0.65, clearcoat: 1, clearcoatRoughness: 0.08 }),
    tire: std('tire', { color: '#151617', roughness: 0.9 }),
    carGlass: new THREE.MeshPhysicalMaterial({ name: 'carGlass', color: '#1b2229', roughness: 0.05, metalness: 0.1, envMapIntensity: 1.5 }),
    mailbox: std('mailbox', { color: '#2f4f6e', roughness: 0.5, metalness: 0.4 }),
  };
  return M;
}

export type Materials = ReturnType<typeof createMaterials>;
export type MaterialKey = keyof Materials;
