/**
 * Texturas procedurais geradas em <canvas> na inicialização.
 * Tudo é original e "tileável" (ruído periódico), com mapas de cor, normal e rugosidade.
 */
import * as THREE from 'three';

export interface TexSet {
  map: THREE.Texture;
  normalMap?: THREE.Texture;
  roughnessMap?: THREE.Texture;
}

// ---------------------------------------------------------------------------
// Ruído periódico
// ---------------------------------------------------------------------------
function hash2(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

/** Value noise 2D periódico com período `p` (em células). */
export function pnoise(x: number, y: number, p: number, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const m = (a: number) => ((a % p) + p) % p;
  const a = hash2(m(xi), m(yi), seed), b = hash2(m(xi + 1), m(yi), seed);
  const c = hash2(m(xi), m(yi + 1), seed), d = hash2(m(xi + 1), m(yi + 1), seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** fBm periódico em coordenadas normalizadas (0..1). */
export function fbm(u: number, v: number, base: number, octaves: number, seed = 0, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0, f = base;
  for (let o = 0; o < octaves; o++) {
    sum += pnoise(u * f, v * f, f, seed + o * 31) * amp;
    norm += amp;
    amp *= gain;
    f *= 2;
  }
  return sum / norm;
}

export const rand = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// ---------------------------------------------------------------------------
// Infra de geração
// ---------------------------------------------------------------------------
type RGB = [number, number, number];
const hex = (h: string): RGB => {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

interface Field {
  size: number;
  color: Float32Array; // rgb 0..255
  height: Float32Array; // 0..1
  rough: Float32Array; // 0..1
}

function field(size: number): Field {
  return {
    size,
    color: new Float32Array(size * size * 3),
    height: new Float32Array(size * size),
    rough: new Float32Array(size * size).fill(0.8),
  };
}

function toCanvasTexture(
  size: number, fill: (img: ImageData) => void, srgb: boolean, maxAniso: number,
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  fill(img);
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = maxAniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function finalize(f: Field, normalStrength: number, aniso: number, withRough = true): TexSet {
  const { size } = f;
  const map = toCanvasTexture(size, (img) => {
    for (let i = 0; i < size * size; i++) {
      img.data[i * 4] = f.color[i * 3];
      img.data[i * 4 + 1] = f.color[i * 3 + 1];
      img.data[i * 4 + 2] = f.color[i * 3 + 2];
      img.data[i * 4 + 3] = 255;
    }
  }, true, aniso);
  const normalMap = normalStrength > 0
    ? toCanvasTexture(size, (img) => {
      const H = f.height;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const l = H[y * size + ((x - 1 + size) % size)], r = H[y * size + ((x + 1) % size)];
          const u = H[((y - 1 + size) % size) * size + x], d = H[((y + 1) % size) * size + x];
          let nx = (l - r) * normalStrength, ny = (u - d) * normalStrength, nz = 1;
          const len = Math.hypot(nx, ny, nz);
          nx /= len; ny /= len; nz /= len;
          const i = (y * size + x) * 4;
          img.data[i] = (nx * 0.5 + 0.5) * 255;
          img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
          img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
          img.data[i + 3] = 255;
        }
      }
    }, false, aniso)
    : undefined;
  const roughnessMap = withRough
    ? toCanvasTexture(size, (img) => {
      for (let i = 0; i < size * size; i++) {
        const r = clamp01(f.rough[i]) * 255;
        img.data[i * 4] = r;
        img.data[i * 4 + 1] = r;
        img.data[i * 4 + 2] = r;
        img.data[i * 4 + 3] = 255;
      }
    }, false, aniso)
    : undefined;
  return { map, normalMap, roughnessMap };
}

function paint(f: Field, fn: (u: number, v: number, x: number, y: number) => { c: RGB; h: number; r?: number }) {
  const { size } = f;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const res = fn(x / size, y / size, x, y);
      const i = y * size + x;
      f.color[i * 3] = res.c[0];
      f.color[i * 3 + 1] = res.c[1];
      f.color[i * 3 + 2] = res.c[2];
      f.height[i] = res.h;
      if (res.r !== undefined) f.rough[i] = res.r;
    }
  }
}

// ---------------------------------------------------------------------------
// Geradores
// ---------------------------------------------------------------------------
export class TextureFactory {
  private cache = new Map<string, TexSet>();
  constructor(private aniso: number, private quality: 'low' | 'high' = 'high') {}

  private get S() {
    return this.quality === 'high' ? 512 : 256;
  }

  private memo(key: string, make: () => TexSet) {
    let t = this.cache.get(key);
    if (!t) {
      t = make();
      this.cache.set(key, t);
    }
    return t;
  }

  grass() {
    return this.memo('grass', () => {
      const f = field(this.S);
      const dark = hex('#3d5e26'), mid = hex('#5b7f34'), light = hex('#87a24a'), dry = hex('#9a9455');
      paint(f, (u, v) => {
        const n = fbm(u, v, 4, 5, 1);
        const blades = fbm(u, v, 64, 2, 7);
        const patch = fbm(u, v, 2, 3, 9);
        let c = mix(dark, mid, clamp01(n * 1.6 - 0.2));
        c = mix(c, light, clamp01((blades - 0.55) * 2.5));
        c = mix(c, dry, clamp01((patch - 0.62) * 2.2) * 0.6);
        return { c, h: blades * 0.7 + n * 0.3, r: 0.92 };
      });
      return finalize(f, 2.2, this.aniso);
    });
  }

  asphalt() {
    return this.memo('asphalt', () => {
      const f = field(this.S);
      const base = hex('#3a3c3f'), lightA = hex('#5a5b5c'), darkA = hex('#2a2b2d');
      paint(f, (u, v) => {
        const n = fbm(u, v, 8, 4, 3);
        const grain = pnoise(u * 512, v * 512, 512, 5);
        const stain = fbm(u, v, 2, 3, 11);
        let c = mix(base, grain > 0.8 ? lightA : darkA, grain > 0.8 ? 0.35 : clamp01((0.25 - grain) * 1.5));
        c = mix(c, darkA, clamp01((stain - 0.55) * 2) * 0.45);
        c = c.map((x) => x * (0.94 + n * 0.12)) as RGB;
        return { c, h: grain * 0.35 + n * 0.65, r: 0.86 + grain * 0.08 };
      });
      return finalize(f, 1.1, this.aniso);
    });
  }

  /** Calçada de concreto em placas (2x2 placas por tile). */
  concrete() {
    return this.memo('concrete', () => {
      const f = field(this.S);
      const base = hex('#b9b5ad'), dark = hex('#8f8b84');
      paint(f, (u, v) => {
        const n = fbm(u, v, 6, 4, 13);
        const fine = pnoise(u * 200, v * 200, 200, 17);
        const gx = Math.min((u * 2) % 1, 1 - ((u * 2) % 1));
        const gy = Math.min((v * 2) % 1, 1 - ((v * 2) % 1));
        const joint = Math.min(gx, gy) < 0.008 ? 1 : 0;
        let c = mix(base, dark, clamp01(n * 0.8 - 0.2));
        c = c.map((x) => x * (0.95 + fine * 0.08)) as RGB;
        if (joint) c = mix(c, dark, 0.7);
        return { c, h: joint ? 0 : 0.6 + n * 0.2 + fine * 0.1, r: 0.9 };
      });
      return finalize(f, 2.5, this.aniso);
    });
  }

  /** Assoalho de madeira (tábuas). */
  woodFloor(tone: 'oak' | 'walnut' = 'oak') {
    return this.memo(`wood-${tone}`, () => {
      const f = field(this.S);
      const a = tone === 'oak' ? hex('#b3865a') : hex('#6b4a33');
      const b = tone === 'oak' ? hex('#8e6440') : hex('#4e3524');
      const planks = 6;
      paint(f, (u, v) => {
        const row = Math.floor(v * planks);
        const off = hash2(row, 0, 21);
        const pu = (u + off) % 1;
        const seg = Math.floor(pu * 2);
        const tint = hash2(row, seg, 23);
        const grain = fbm(pu * 0.5 + tint, v * 8, 4, 4, 29) ;
        const ring = Math.sin((grain * 18 + v * planks * 3) * Math.PI) * 0.5 + 0.5;
        let c = mix(a, b, clamp01(0.25 + tint * 0.5 + (ring - 0.5) * 0.35));
        const edgeV = (v * planks) % 1;
        const edgeU = (pu * 2) % 1;
        const seam = edgeV < 0.025 || edgeV > 0.975 || edgeU < 0.004 || edgeU > 0.996;
        if (seam) c = c.map((x) => x * 0.55) as RGB;
        return { c, h: seam ? 0 : 0.7 + ring * 0.1, r: 0.55 + ring * 0.15 };
      });
      return finalize(f, 2.2, this.aniso);
    });
  }

  /** Piso cerâmico: `tiles` por tile de textura. */
  tiles(key: string, colorA: string, colorB: string, tiles: number, grout = '#d8d4cc', groutW = 0.012) {
    return this.memo(`tiles-${key}`, () => {
      const f = field(this.S);
      const A = hex(colorA), B = hex(colorB), Gr = hex(grout);
      paint(f, (u, v) => {
        const tx = Math.floor(u * tiles), ty = Math.floor(v * tiles);
        const fu = (u * tiles) % 1, fv = (v * tiles) % 1;
        const tint = hash2(tx, ty, 41);
        const n = fbm(u, v, 8, 3, 43);
        const isG = fu < groutW * tiles || fv < groutW * tiles;
        let c = mix(A, B, clamp01(tint * 0.6 + (n - 0.5) * 0.6));
        if (isG) c = Gr;
        return { c, h: isG ? 0 : 1, r: isG ? 0.95 : 0.25 + n * 0.15 };
      });
      return finalize(f, 1.6, this.aniso);
    });
  }

  /** Reboco liso (paredes). Cor neutra clara — o material aplica a cor final. */
  plaster() {
    return this.memo('plaster', () => {
      const f = field(this.S);
      paint(f, (u, v) => {
        const n = fbm(u, v, 8, 5, 51);
        const fine = pnoise(u * 300, v * 300, 300, 53);
        const g = 235 + (n - 0.5) * 18 + (fine - 0.5) * 8;
        return { c: [g, g, g], h: n * 0.6 + fine * 0.4, r: 0.85 };
      });
      return finalize(f, 0.9, this.aniso);
    });
  }

  /** Revestimento em ripas de madeira verticais (fachada). */
  woodCladding() {
    return this.memo('cladding', () => {
      const f = field(this.S);
      const a = hex('#9c6b43'), b = hex('#7a4f2e');
      const boards = 8;
      paint(f, (u, v) => {
        const col = Math.floor(u * boards);
        const tint = hash2(col, 3, 61);
        const fu = (u * boards) % 1;
        const grain = fbm(u * 2 + tint, v, 3, 4, 63);
        const ring = Math.sin((grain * 14 + fu * 2) * Math.PI) * 0.5 + 0.5;
        let c = mix(a, b, clamp01(tint * 0.6 + (ring - 0.5) * 0.4));
        const gap = fu < 0.06;
        if (gap) c = c.map((x) => x * 0.35) as RGB;
        return { c, h: gap ? 0 : 0.8 + ring * 0.1, r: 0.7 };
      });
      return finalize(f, 3, this.aniso);
    });
  }

  /** Tijolinho aparente. */
  brick() {
    return this.memo('brick', () => {
      const f = field(this.S);
      const a = hex('#a4583d'), b = hex('#7d3f2b'), m = hex('#cfc6b8');
      const rows = 8, cols = 4;
      paint(f, (u, v) => {
        const r = Math.floor(v * rows);
        const uu = (u * cols + (r % 2) * 0.5) % 1;
        const c0 = Math.floor(u * cols + (r % 2) * 0.5);
        const fu = (u * cols + (r % 2) * 0.5) % 1;
        const fv = (v * rows) % 1;
        const mortar = fu < 0.03 || fv < 0.07;
        const tint = hash2(c0, r, 71);
        const n = fbm(u, v, 16, 3, 73);
        let c = mix(a, b, clamp01(tint * 0.8 + (n - 0.5) * 0.5));
        if (mortar) c = m;
        void uu;
        return { c, h: mortar ? 0 : 0.8 + n * 0.2, r: 0.9 };
      });
      return finalize(f, 3, this.aniso);
    });
  }

  /** Tecido (sofá, cama). */
  fabric() {
    return this.memo('fabric', () => {
      const f = field(this.S);
      paint(f, (u, v, x, y) => {
        const weave = ((x >> 1) + (y >> 1)) % 2 === 0 ? 1 : 0.85;
        const n = fbm(u, v, 16, 3, 81);
        const g = 230 * weave * (0.92 + n * 0.12);
        return { c: [g, g, g], h: weave * 0.7 + n * 0.3, r: 0.95 };
      });
      return finalize(f, 1.2, this.aniso);
    });
  }

  /** Casca de árvore. */
  bark() {
    return this.memo('bark', () => {
      const f = field(256);
      const a = hex('#5b4636'), b = hex('#3a2c22');
      paint(f, (u, v) => {
        const n = fbm(u * 3, v * 0.6, 4, 5, 91);
        const ridges = Math.abs(Math.sin((u * 10 + n * 3) * Math.PI));
        const c = mix(a, b, clamp01(1 - ridges + (n - 0.5)));
        return { c, h: ridges, r: 0.95 };
      });
      return finalize(f, 4, this.aniso);
    });
  }

  /** Folhagem (aplicada às copas). */
  foliage() {
    return this.memo('foliage', () => {
      const f = field(256);
      const a = hex('#4f7a32'), b = hex('#2f5320'), c2 = hex('#86ad4a');
      paint(f, (u, v) => {
        const n = fbm(u, v, 8, 4, 101);
        const leaf = pnoise(u * 48, v * 48, 48, 103);
        let c = mix(b, a, clamp01(n * 1.4 - 0.1));
        c = mix(c, c2, clamp01((leaf - 0.7) * 3));
        return { c, h: leaf, r: 0.8 };
      });
      return finalize(f, 3, this.aniso);
    });
  }

  /** Bancada de pedra / mármore claro. */
  stone() {
    return this.memo('stone', () => {
      const f = field(this.S);
      const a = hex('#e7e3dc'), b = hex('#b9b2a8');
      paint(f, (u, v) => {
        const n = fbm(u, v, 3, 6, 111);
        const vein = Math.pow(1 - Math.abs(Math.sin((u * 2 + n * 4) * Math.PI)), 12);
        const c = mix(a, b, clamp01(vein * 0.8 + (n - 0.5) * 0.3));
        return { c, h: n, r: 0.18 + n * 0.1 };
      });
      return finalize(f, 0.6, this.aniso);
    });
  }

  /** Piso de pedras irregulares (caminho do jardim). */
  pavers() {
    return this.memo('pavers', () => {
      const f = field(this.S);
      const a = hex('#a39a8c'), b = hex('#7d766b'), gap = hex('#4f5a35');
      const pts: [number, number][] = [];
      const r = rand(7);
      for (let i = 0; i < 18; i++) pts.push([r(), r()]);
      paint(f, (u, v) => {
        let d1 = 9, d2 = 9, id = 0;
        for (let i = 0; i < pts.length; i++) {
          for (let ox = -1; ox <= 1; ox++) {
            for (let oy = -1; oy <= 1; oy++) {
              const dx = u - pts[i][0] - ox, dy = v - pts[i][1] - oy;
              const d = Math.hypot(dx, dy);
              if (d < d1) { d2 = d1; d1 = d; id = i; } else if (d < d2) d2 = d;
            }
          }
        }
        const edge = d2 - d1;
        const n = fbm(u, v, 8, 3, 121);
        let c = mix(a, b, clamp01(hash2(id, 1, 123) * 0.8 + (n - 0.5) * 0.4));
        if (edge < 0.025) c = gap;
        return { c, h: edge < 0.025 ? 0 : Math.min(1, edge * 8) * 0.5 + 0.5, r: 0.9 };
      });
      return finalize(f, 3, this.aniso);
    });
  }

  /** Telhado plano (manta/brita). */
  roofing() {
    return this.memo('roof', () => {
      const f = field(256);
      paint(f, (u, v) => {
        const g = pnoise(u * 128, v * 128, 128, 131);
        const n = fbm(u, v, 4, 3, 133);
        const c = 95 + g * 40 + n * 20;
        return { c: [c, c, c * 1.02], h: g, r: 0.95 };
      });
      return finalize(f, 2, this.aniso);
    });
  }
}
