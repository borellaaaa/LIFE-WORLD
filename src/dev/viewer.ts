/**
 * Visualizador de desenvolvimento do personagem (viewer.html).
 * Parâmetros de URL: ?clip=Walk&t=0.3&view=front|side|back|face&cols=1
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const params = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#2a3138');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;
const sun = new THREE.DirectionalLight('#fff4e6', 2.2);
sun.position.set(2, 4, 3);
sun.castShadow = true;
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: '#59616a' }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const view = params.get('view') ?? 'front';
const camera = new THREE.PerspectiveCamera(view === 'face' ? 20 : 30, innerWidth / innerHeight, 0.05, 100);
const views: Record<string, [number, number, number, number]> = {
  front: [0, 1.0, 4.2, 0.9], side: [4.2, 1.0, 0, 0.9], back: [0, 1.0, -4.2, 0.9],
  face: [0.0, 1.66, 0.75, 1.64], three: [2.6, 1.4, 3.2, 0.9],
};
const v = views[view] ?? views.front;
camera.position.set(v[0], v[1], v[2]);
camera.lookAt(0, v[3], 0);

const clipName = params.get('clip') ?? 'Idle';
const t = parseFloat(params.get('t') ?? '0');
new GLTFLoader().load('./models/character.glb', (gltf) => {
  const root = gltf.scene;
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  scene.add(root);
  const mixer = new THREE.AnimationMixer(root);
  const clip = gltf.animations.find((c) => c.name === clipName);
  if (clip && clipName !== 'Bind') {
    const action = mixer.clipAction(clip);
    action.play();
    mixer.setTime(t * clip.duration);
  }
  (document.getElementById('info') as HTMLElement).textContent =
    `${clipName} t=${t} | clips: ${gltf.animations.map((c) => c.name).join(', ')} | ${JSON.stringify(root.children[0]?.userData ?? {})}`;
  renderer.render(scene, camera);
  (window as unknown as { __ready: boolean }).__ready = true;
});
