/**
 * Orquestrador do jogo: carrega sistemas, roda o loop e conecta motor <-> UI.
 *
 * Ordem do quadro: entrada -> relógio -> atividades/necessidades -> jogador
 * (Rapier KCC) -> portas -> passo de física -> câmera -> interação -> luz/clima
 * -> render.
 */
import * as THREE from 'three';
import { Engine, LAYER_ROOF } from './core/Engine';
import { Input } from './core/Input';
import { Physics } from './physics/Physics';
import { TextureFactory } from './world/textures';
import { createMaterials, type Materials } from './world/materials';
import { buildNeighborhood, type NeighborhoodResult } from './world/Neighborhood';
import { DayNight } from './world/DayNight';
import { windUniforms } from './world/vegetation';
import { CharacterModel } from './player/CharacterModel';
import { PlayerController } from './player/PlayerController';
import { ThirdPersonCamera } from './player/ThirdPersonCamera';
import { InteractionSystem } from './interaction/InteractionSystem';
import { ActivitySystem } from './sim/ActivitySystem';
import { GameClock } from './sim/GameClock';
import { Needs, NEED_LABELS } from './sim/Needs';
import { gameStore, pushToast, setMenu, type UIState } from './state/store';
import type { Settings } from './state/settings';
import type { InteractionContext } from './interaction/types';

type Progress = (p: number, label: string) => void;

export class Game {
  readonly engine: Engine;
  readonly input: Input;
  physics!: Physics;
  mats!: Materials;
  world!: NeighborhoodResult;
  dayNight!: DayNight;
  model!: CharacterModel;
  player!: PlayerController;
  cam!: ThirdPersonCamera;
  interactions!: InteractionSystem;
  activities!: ActivitySystem;
  readonly clock = new GameClock(1, 8 * 60 + 30);
  needs!: Needs;
  private raf = 0;
  private last = 0;
  private realTime = 0;
  private uiTimer = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  private running = false;
  private unsub: (() => void)[] = [];
  private camForward = new THREE.Vector3();

  private constructor(container: HTMLElement) {
    this.engine = new Engine(container);
    this.input = new Input(this.engine.canvas);
  }

  static async create(container: HTMLElement, onProgress: Progress): Promise<Game> {
    const g = new Game(container);
    await g.load(onProgress);
    return g;
  }

  private async load(progress: Progress) {
    const yieldFrame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
    progress(0.05, 'Iniciando física...');
    this.physics = await Physics.create();
    await yieldFrame();

    progress(0.15, 'Gerando texturas...');
    const s = gameStore.getState().settings;
    const tf = new TextureFactory(Math.min(8, this.engine.renderer.capabilities.getMaxAnisotropy()), s.renderScale < 0.8 ? 'low' : 'high');
    this.mats = createMaterials(tf);
    await yieldFrame();

    // personagem em paralelo com a construção do mundo
    const modelPromise = CharacterModel.load((p) => progress(0.55 + p * 0.3, 'Carregando personagem...'));

    let step = 0.3;
    this.world = buildNeighborhood(this.mats, this.physics, this.engine.scene, (label) => {
      step = Math.min(0.52, step + 0.04);
      progress(step, label);
    });
    await yieldFrame();

    progress(0.55, 'Acendendo o céu...');
    this.dayNight = new DayNight(this.engine.scene, this.engine.renderer, this.mats, this.world.lampHeads);
    this.dayNight.registerInteriorLights(this.world.house.lights);

    this.model = await modelPromise;
    progress(0.88, 'Preparando o personagem...');
    this.engine.scene.add(this.model.root);
    this.player = new PlayerController(this.physics, this.model, this.world.house.spawn);
    this.cam = new ThirdPersonCamera(this.engine.camera, this.physics);
    this.cam.snapBehind(this.world.house.spawn.yaw);
    this.cam.pitch = 0.28;

    // simulação
    const st = gameStore.getState();
    this.needs = new Needs(st.needs);
    this.needs.onLow = (id) => pushToast(`${NEED_LABELS[id]} muito baixa!`, 'warn', 5000);
    this.activities = new ActivitySystem(this.player, this.model, this.needs, this.clock);
    this.activities.onMoneyChange = (d) => gameStore.setState((s2) => ({ money: Math.max(0, s2.money + d) }));
    const ctx: InteractionContext = {
      startActivity: (def) => this.activities.start(def),
      toast: (t, k) => pushToast(t, k),
      money: () => gameStore.getState().money,
      playerPosition: () => this.player.feet.clone(),
    };
    this.interactions = new InteractionSystem(ctx);
    this.interactions.register(...this.world.house.interactables);
    this.clock.onHour((hour) => {
      if (hour === 7) pushToast('Bom dia! Um novo dia começou.', 'info');
      if (hour === 22) pushToast('Está ficando tarde. Que tal dormir?', 'info');
    });

    this.applySettings(s);
    this.unsub.push(gameStore.subscribe((cur, prev) => {
      if (cur.settings !== prev.settings) this.applySettings(cur.settings);
    }));
    this.input.onPointerLockChange = (locked) => {
      gameStore.setState({ pointerLocked: locked });
      const state = gameStore.getState();
      if (!locked && state.phase === 'playing' && state.menu === 'none') setMenu('pause');
    };
    window.addEventListener('keydown', this.onKey);

    // compila shaders antes de começar (evita travadas no primeiro quadro)
    progress(0.95, 'Compilando shaders...');
    this.dayNight.update(this.clock.minuteOfDay, this.player.feet, 0);
    this.engine.renderer.compile(this.engine.scene, this.engine.camera);
    await yieldFrame();
    progress(1, 'Pronto!');
    const q = new URLSearchParams(location.search);
    if (import.meta.env.DEV || q.has('debug') || q.has('capture')) this.exposeDebug();
  }

  applySettings(s: Settings) {
    this.engine.applySettings(s);
    this.dayNight?.setShadowQuality(s.shadows);
    this.world?.grass.setDensity(s.grassDensity);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** começa a jogar (após clique no título) */
  enterPlay() {
    gameStore.setState({ phase: 'playing', menu: 'none' });
    this.input.requestPointerLock();
    this.engine.canvas.focus();
  }

  resume() {
    setMenu('none');
    this.input.requestPointerLock();
  }

  private onKey = (e: KeyboardEvent) => {
    const st = gameStore.getState();
    if (st.phase !== 'playing') return;
    if (e.code === 'Escape') {
      if (st.menu === 'none') {
        setMenu('pause');
        this.input.exitPointerLock();
      } else if (st.menu === 'pause') this.resume();
      else setMenu('pause');
      return;
    }
    if (st.menu !== 'none') return;
    if (e.code === 'Digit1') this.setSpeed(1);
    if (e.code === 'Digit2') this.setSpeed(2);
    if (e.code === 'Digit3') this.setSpeed(3);
    if (e.code === 'Digit0' || e.code === 'KeyP') this.setSpeed(this.clock.speed === 0 ? 1 : 0);
    if (e.code === 'F3') {
      e.preventDefault();
      gameStore.setState((s) => ({ settings: { ...s.settings, showFps: !s.settings.showFps } }));
    }
  };

  setSpeed(i: number) {
    this.clock.speed = i;
    this.pushUI(true);
  }

  private frame(dt: number, render = true) {
    const st = gameStore.getState();
    const playing = st.phase === 'playing' && st.menu === 'none';
    this.realTime += dt;
    windUniforms.uTime.value = this.realTime;
    this.input.enabled = playing;

    if (playing) {
      const [mx, my] = this.input.consumeMouse();
      this.cam.rotate(mx, my, st.settings.mouseSensitivity, st.settings.invertY);
      const wheel = this.input.consumeWheel();
      if (wheel) this.cam.zoom(wheel);

      const gameMin = this.clock.tick(dt);
      const moveKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
      const cancel = this.activities.busy && moveKeys.some((k) => this.input.wasPressed(k));
      this.activities.update(dt, gameMin, cancel);
      this.interactions.enabled = !this.activities.busy && !this.player.locked;
    } else {
      this.input.consumeMouse();
      this.input.consumeWheel();
    }

    // jogador e física (também no título, para o idle animar)
    this.player.update(playing ? dt : dt, this.input, this.cam.forwardYaw);
    for (const d of this.world.house.doors) d.update(dt);
    this.physics.world.timestep = Math.max(1 / 240, dt);
    this.physics.step();

    // casa: dentro -> esconde telhado/forro da câmera
    const head = this.player.feet.clone().add(new THREE.Vector3(0, 1.2, 0));
    const indoor = this.world.house.interior.containsPoint(head);
    if (indoor !== this.cam.indoor) {
      this.cam.indoor = indoor;
      if (indoor) this.engine.camera.layers.disable(LAYER_ROOF);
      else this.engine.camera.layers.enable(LAYER_ROOF);
    }
    // a câmera segue o modelo (durante atividades ele fica na âncora, não na cápsula)
    this.cam.update(dt, this.model.root.position, this.activities.busy ? 1.25 : 1.55);
    this.model.root.visible = this.cam.currentDistance > 0.55;

    if (playing) {
      this.engine.camera.getWorldDirection(this.camForward);
      this.interactions.update(this.player.feet, this.player.yaw, this.camForward, this.input);
    }

    this.dayNight.update(this.clock.minuteOfDay, this.player.feet, this.realTime, this.cam.indoor, dt);
    this.world.house.update(dt, this.realTime);
    this.world.grass.update(this.engine.camera.position);
    if (render) this.engine.render();
    this.input.endFrame();

    // UI em ~8 Hz
    this.fpsFrames++;
    this.fpsTime += dt;
    this.uiTimer += dt;
    if (this.uiTimer > 0.125) {
      this.uiTimer = 0;
      this.pushUI(false);
    }
  }

  private pushUI(force: boolean) {
    const st = gameStore.getState();
    const patch: Partial<UIState> = {
      clock: {
        day: this.clock.day,
        weekday: this.clock.weekday,
        minutes: this.clock.minuteOfDay,
        speed: this.clock.speed,
        paused: this.clock.paused,
      },
      needs: { ...this.needs.values },
      mood: this.needs.mood,
      location: this.locationName(),
    };
    if (this.fpsTime > 0.5) {
      patch.fps = Math.round(this.fpsFrames / this.fpsTime);
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
    if (force || st.phase === 'playing') gameStore.setState(patch);
  }

  private locationName() {
    const p = this.player.feet.clone().add(new THREE.Vector3(0, 0.5, 0));
    for (const r of this.world.house.rooms) if (r.box.containsPoint(p)) return r.name;
    if (Math.abs(p.z) < 7.1) return 'Rua das Acácias';
    if (p.x > -13 && p.x < 13 && p.z < -7) return p.z < -25.5 ? 'Quintal' : 'Jardim';
    return 'Vizinhança';
  }

  /** API de depuração/testes automatizados: window.__lifeWorld (dev, ?debug ou ?capture) */
  private exposeDebug() {
    const api = {
      game: this,
      store: gameStore,
      teleport: (x: number, z: number, yaw = 0) => {
        const y = this.world.house.interior.containsPoint(new THREE.Vector3(x, 1, z)) ? 0.27 : 0.12;
        this.player.teleport({ position: new THREE.Vector3(x, y, z), yaw });
        this.cam.snapBehind(yaw);
      },
      setTime: (hour: number) => {
        this.clock.total = (this.clock.day - 1) * 1440 + hour * 60;
      },
      setCamera: (yaw: number, pitch: number, distance?: number) => {
        this.cam.yaw = yaw;
        this.cam.pitch = pitch;
        if (distance) this.cam.distance = distance;
      },
      key: (code: string, down: boolean) => this.input.simulate(code, down),
      /** avança a simulação `seconds` segundos sem depender da taxa de quadros (testes) */
      simulate: (seconds: number, step = 1 / 30) => {
        const n = Math.max(1, Math.round(seconds / step));
        for (let i = 0; i < n; i++) this.frame(step, false);
      },
      render: () => this.engine.render(),
      /** para/retoma o loop de animação (capturas em GPUs por software) */
      stopLoop: () => {
        cancelAnimationFrame(this.raf);
        this.running = false;
      },
      startLoop: () => this.start(),
      pushUI: () => this.pushUI(true),
      state: () => ({
        feet: this.player.feet.toArray(),
        yaw: this.player.yaw,
        grounded: this.player.grounded,
        speed: this.player.speed,
        focused: this.interactions.focused?.id ?? null,
        activity: this.activities.current?.id ?? null,
        doors: Object.fromEntries(this.world.house.doors.map((d) => [d.id, d.isOpen])),
        needs: { ...this.needs.values },
        money: gameStore.getState().money,
        clock: { day: this.clock.day, minute: this.clock.minuteOfDay },
        indoor: this.cam.indoor,
        drawCalls: this.engine.renderer.info.render.calls,
        triangles: this.engine.renderer.info.render.triangles,
        colliders: this.physics.colliderCount,
      }),
    };
    (window as unknown as { __lifeWorld: typeof api }).__lifeWorld = api;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey);
    this.unsub.forEach((u) => u());
    this.input.dispose();
    this.dayNight?.dispose();
    this.engine.dispose();
  }
}
