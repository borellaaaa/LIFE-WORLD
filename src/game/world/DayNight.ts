/**
 * Ciclo de dia e noite: céu atmosférico, sol/lua com sombras dinâmicas,
 * luz ambiente baseada em imagem (IBL) do próprio céu, estrelas, neblina
 * e iluminação noturna (casas, postes, janelas).
 */
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { LAYER_ROOF } from '../core/Engine';
import type { Materials } from './materials';
import type { ShadowQuality } from '../state/settings';

const smooth = (a: number, b: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export class DayNight {
  readonly sun = new THREE.DirectionalLight('#ffffff', 3);
  readonly hemi = new THREE.HemisphereLight('#bcd4ff', '#5d5140', 0.4);
  private sky = new Sky();
  private envSky = new Sky();
  private envScene = new THREE.Scene();
  private pmrem: THREE.PMREMGenerator;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private lastEnvElevation = 99;
  private lastEnvTime = -99;
  private stars: THREE.Points;
  private pools: THREE.Mesh;
  readonly sunDir = new THREE.Vector3();
  nightFactor = 0;
  private interiorLights: THREE.PointLight[] = [];
  private fog: THREE.Fog;
  /** IBL neutro para interiores (o céu não "vaza" para dentro de casa) */
  private roomEnv: THREE.Texture;
  private skyEnv: THREE.Texture | null = null;
  private indoorBlend = 0;

  constructor(
    private scene: THREE.Scene,
    private renderer: THREE.WebGLRenderer,
    private mats: Materials,
    lampHeads: THREE.Vector3[],
  ) {
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.roomEnv = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.sky.scale.setScalar(4000);
    this.sky.frustumCulled = false;
    const u = this.sky.material.uniforms;
    u.turbidity.value = 2.6;
    u.rayleigh.value = 1.3;
    u.mieCoefficient.value = 0.003;
    u.mieDirectionalG.value = 0.82;
    scene.add(this.sky);

    this.envSky.scale.setScalar(1000);
    Object.assign(this.envSky.material.uniforms.turbidity, { value: 4.5 });
    this.envSky.material.uniforms.rayleigh.value = 1.6;
    this.envSky.material.uniforms.mieCoefficient.value = 0.004;
    this.envSky.material.uniforms.mieDirectionalG.value = 0.82;
    this.envScene.add(this.envSky);

    this.sun.castShadow = true;
    this.sun.shadow.camera.layers.enable(LAYER_ROOF);
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.035;
    scene.add(this.sun, this.sun.target, this.hemi);
    this.setShadowQuality('high');

    this.fog = new THREE.Fog('#c9d6e0', 70, 330);
    scene.fog = this.fog;

    this.stars = this.makeStars();
    scene.add(this.stars);
    this.pools = this.makeLightPools(lampHeads);
    scene.add(this.pools);
  }

  registerInteriorLights(lights: THREE.PointLight[]) {
    this.interiorLights.push(...lights);
  }

  setShadowQuality(q: ShadowQuality) {
    const size = q === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(size, size);
    const ext = q === 'high' ? 34 : 26;
    const cam = this.sun.shadow.camera;
    cam.left = -ext; cam.right = ext; cam.top = ext; cam.bottom = -ext;
    cam.near = 1; cam.far = 220;
    cam.updateProjectionMatrix();
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
  }

  private makeStars() {
    const n = 1400;
    const pos = new Float32Array(n * 3);
    const size = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const y = Math.abs(u) * 0.95 + 0.05;
      pos.set([Math.cos(a) * r * 600, y * 600, Math.sin(a) * r * 600], i * 3);
      size[i] = Math.random() < 0.08 ? 2.6 : 1.2 + Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float aSize; uniform float uTime; varying float vTw;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_Position.z = gl_Position.w * 0.9999;
          vTw = 0.75 + 0.25 * sin(uTime * 2.0 + position.x * 0.13);
          gl_PointSize = aSize;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uOpacity; varying float vTw;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float a = smoothstep(0.5, 0.0, length(c));
          gl_FragColor = vec4(vec3(0.9, 0.93, 1.0), a * uOpacity * vTw);
        }`,
    });
    const p = new THREE.Points(g, mat);
    p.frustumCulled = false;
    p.renderOrder = -1;
    return p;
  }

  /** Manchas de luz no chão sob os postes (baratas: sem luzes reais). */
  private makeLightPools(heads: THREE.Vector3[]) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,214,150,0.9)');
    g.addColorStop(0.4, 'rgba(255,200,130,0.35)');
    g.addColorStop(1, 'rgba(255,190,120,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: true });
    const geo = new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2);
    const inst = new THREE.InstancedMesh(geo, mat, Math.max(1, heads.length));
    heads.forEach((h, i) => inst.setMatrixAt(i, new THREE.Matrix4().makeTranslation(h.x, 0.14, h.z)));
    inst.count = heads.length;
    inst.renderOrder = 1;
    return inst;
  }

  /**
   * Atualiza a iluminação para o horário (minutos desde 00:00) e centraliza
   * a câmera de sombra no jogador.
   */
  update(minutes: number, focus: THREE.Vector3, realTime: number, indoor = false, dt = 0.016) {
    this.indoorBlend += ((indoor ? 1 : 0) - this.indoorBlend) * (1 - Math.exp(-dt * 6));
    const ib = this.indoorBlend;
    const hour = minutes / 60;
    // sol: nasce 6:00 (leste, +X), se põe 18:30 (oeste, -X), passa ao sul (+Z)
    const theta = ((hour - 6) / 12.5) * Math.PI;
    this.sunDir.set(Math.cos(theta), Math.sin(theta) * 0.86, Math.sin(theta) * 0.42 + 0.12).normalize();
    const elev = this.sunDir.y;
    const day = smooth(-0.1, 0.18, elev);
    const golden = 1 - smooth(0.02, 0.32, Math.abs(elev));
    this.nightFactor = 1 - smooth(-0.14, 0.04, elev);

    // céu
    const su = this.sky.material.uniforms;
    su.sunPosition.value.copy(this.sunDir).multiplyScalar(1000);
    su.rayleigh.value = 1.05 + golden * 1.6;
    su.turbidity.value = 2.2 + golden * 4;
    this.sky.position.copy(focus);

    // luz direcional: sol de dia, lua à noite
    const moon = elev < -0.02;
    const lightDir = moon ? new THREE.Vector3(-this.sunDir.x * 0.6, Math.max(0.35, -elev), -this.sunDir.z + 0.3).normalize() : this.sunDir;
    this.sun.position.copy(focus).addScaledVector(lightDir, 90);
    this.sun.target.position.copy(focus);
    if (moon) {
      this.sun.color.set('#9fb4e6');
      this.sun.intensity = 0.55 * this.nightFactor;
    } else {
      const warm = new THREE.Color('#ff9a5c').lerp(new THREE.Color('#fff3e2'), smooth(0.03, 0.4, elev));
      this.sun.color.copy(warm);
      this.sun.intensity = 2.7 * day;
    }

    // ambiente
    this.hemi.color.set('#9fbdf0').lerp(new THREE.Color('#3b5288'), this.nightFactor);
    this.hemi.groundColor.set('#6b5a44').lerp(new THREE.Color('#242018'), this.nightFactor);
    this.hemi.intensity = (0.18 + 0.62 * this.nightFactor) * (1 - 0.55 * ib);
    const outdoorEnv = 0.1 + 0.42 * day;
    const indoorEnv = 0.06 + 0.3 * day;
    this.scene.environmentIntensity = THREE.MathUtils.lerp(outdoorEnv, indoorEnv, ib);
    const wantEnv = ib > 0.5 ? this.roomEnv : this.skyEnv;
    if (wantEnv && this.scene.environment !== wantEnv) this.scene.environment = wantEnv;

    // neblina: cor do horizonte
    const fogDay = new THREE.Color('#aec4d6'), fogGold = new THREE.Color('#e7b48c'), fogNight = new THREE.Color('#0c1220');
    const fc = fogDay.clone().lerp(fogGold, golden * day * 0.8).lerp(fogNight, this.nightFactor);
    this.fog.color.copy(fc);

    // exposição
    this.renderer.toneMappingExposure = 0.88 + 0.32 * this.nightFactor + 0.12 * ib;

    // estrelas e lâmpadas
    const starMat = this.stars.material as THREE.ShaderMaterial;
    starMat.uniforms.uOpacity.value = smooth(0.35, 0.9, this.nightFactor);
    starMat.uniforms.uTime.value = realTime;
    this.stars.position.copy(focus);
    const lightsOn = smooth(0.25, 0.6, this.nightFactor);
    this.mats.lampGlow.emissiveIntensity = 2.6 * lightsOn;
    this.mats.windowLit.emissiveIntensity = 0.9 * lightsOn;
    (this.pools.material as THREE.MeshBasicMaterial).opacity = 0.55 * lightsOn;
    this.pools.visible = lightsOn > 0.01;
    for (const l of this.interiorLights) l.intensity = 7.5 * lightsOn * ((l.userData.scale as number | undefined) ?? 1);

    // IBL do céu (regenerado só quando o sol muda o suficiente)
    if (Math.abs(elev - this.lastEnvElevation) > 0.015 || realTime - this.lastEnvTime > 30) {
      this.envSky.material.uniforms.sunPosition.value.copy(this.sunDir).multiplyScalar(1000);
      this.envSky.material.uniforms.rayleigh.value = su.rayleigh.value;
      this.envSky.material.uniforms.turbidity.value = su.turbidity.value;
      const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 1000);
      this.envRT?.dispose();
      this.envRT = rt;
      this.skyEnv = rt.texture;
      if (this.indoorBlend <= 0.5) this.scene.environment = rt.texture;
      this.lastEnvElevation = elev;
      this.lastEnvTime = realTime;
    }
  }

  dispose() {
    this.envRT?.dispose();
    this.pmrem.dispose();
  }
}
