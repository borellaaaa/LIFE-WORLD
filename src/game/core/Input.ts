/**
 * Entrada de teclado e mouse.
 * - Teclas por `KeyboardEvent.code` (independe do layout: WASD funciona em ABNT2).
 * - Mouse: pointer lock quando disponível; senão, arrastar com botão direito/esquerdo.
 */
export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private mouseDX = 0;
  private mouseDY = 0;
  private wheel = 0;
  private dragging = false;
  locked = false;
  enabled = true;
  onPointerLockChange?: (locked: boolean) => void;

  constructor(private element: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    element.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    element.addEventListener('wheel', this.onWheel, { passive: false });
    element.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', this.onLockChange);
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.element.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    this.element.removeEventListener('wheel', this.onWheel);
    document.removeEventListener('pointerlockchange', this.onLockChange);
  }

  requestPointerLock() {
    const el = this.element as HTMLElement & { requestPointerLock?: (o?: unknown) => Promise<void> | void };
    try {
      const r = el.requestPointerLock?.();
      if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => undefined);
    } catch {
      /* sem pointer lock (ex.: iframe sem permissão) — usa arrastar */
    }
  }

  exitPointerLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(code: string) {
    return this.enabled && this.down.has(code);
  }

  /** true apenas no quadro em que a tecla foi pressionada */
  wasPressed(code: string) {
    return this.enabled && this.pressed.has(code);
  }

  consumeMouse(): [number, number] {
    const r: [number, number] = [this.mouseDX, this.mouseDY];
    this.mouseDX = 0;
    this.mouseDY = 0;
    return r;
  }

  consumeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  /** chamar no fim de cada quadro */
  endFrame() {
    this.pressed.clear();
  }

  /** simula teclas (usado pelos testes automatizados e pela API de debug) */
  simulate(code: string, isDown: boolean) {
    if (isDown) {
      if (!this.down.has(code)) this.pressed.add(code);
      this.down.add(code);
    } else this.down.delete(code);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
    if (!this.down.has(e.code)) this.pressed.add(e.code);
    this.down.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.down.delete(e.code);
  };

  private onBlur = () => {
    this.down.clear();
    this.dragging = false;
  };

  private onMouseDown = (e: MouseEvent) => {
    if (!this.locked) this.dragging = true;
    e.preventDefault();
  };

  private onMouseUp = () => {
    this.dragging = false;
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.enabled) return;
    if (this.locked || this.dragging) {
      // limita picos (alguns navegadores reportam saltos ao travar o ponteiro)
      this.mouseDX += Math.max(-250, Math.min(250, e.movementX));
      this.mouseDY += Math.max(-250, Math.min(250, e.movementY));
    }
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.wheel += Math.sign(e.deltaY);
  };

  private onLockChange = () => {
    this.locked = document.pointerLockElement === this.element;
    this.onPointerLockChange?.(this.locked);
  };
}
