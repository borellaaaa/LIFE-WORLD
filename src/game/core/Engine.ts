/**
 * Renderizador, cena e câmera principal. Responsável por qualidade gráfica e resize.
 */
import * as THREE from 'three';
import type { Settings } from '../state/settings';

export const LAYER_ROOF = 1; // telhado/forro: some da câmera quando o jogador está dentro de casa

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private resizeObserver: ResizeObserver;
  private renderScale = 1;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: new URLSearchParams(location.search).has('capture'),
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'game-canvas';
    this.renderer.domElement.tabIndex = 0;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(62, 1, 0.08, 900);
    this.camera.layers.enable(LAYER_ROOF);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  get canvas() {
    return this.renderer.domElement;
  }

  applySettings(s: Settings) {
    this.renderScale = s.renderScale;
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
    const enabled = s.shadows !== 'off';
    if (this.renderer.shadowMap.enabled !== enabled) {
      this.renderer.shadowMap.enabled = enabled;
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (!m) return;
        (Array.isArray(m) ? m : [m]).forEach((mm) => (mm.needsUpdate = true));
      });
    }
    this.resize();
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * this.renderScale);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.resizeObserver.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
