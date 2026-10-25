/**
 * Movement input. Two touch schemes:
 *  - 'drag': floating joystick, touch anywhere and drag; the base follows the thumb past the rim.
 *  - 'left' / 'right': a fixed thumb pad in a bottom corner, so the hand never covers the action.
 *    Touches must start on the pad; the knob is clamped to the rim.
 * Keyboard (WASD / arrows) always works on desktop.
 */
export type ControlMode = 'drag' | 'left' | 'right';
export class Input {
  mx = 0;
  my = 0;
  stick: { ox: number; oy: number; x: number; y: number } | null = null;
  private pointerId: number | null = null;
  private keys = new Set<string>();
  private readonly R = 52;
  mode: ControlMode = 'drag';
  enabled = true;
  /** Set the first time the player moves in a run; drives the controls hint. */
  moved = false;

  constructor(el: HTMLElement) {
    el.addEventListener('pointerdown', this.down, { passive: false });
    window.addEventListener('pointermove', this.move, { passive: false });
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.up);
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.key.toLowerCase());
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.release();
    });
  }

  /** Centre of the fixed pad in CSS pixels (bottom corner, above the home indicator). */
  padCenter(): { x: number; y: number } {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const inset = Math.max(78, Math.min(vw, vh) * 0.2);
    return { x: this.mode === 'right' ? vw - inset : inset, y: vh - inset - 34 };
  }

  private down = (e: PointerEvent) => {
    if (!this.enabled || this.pointerId !== null) return;
    if (this.mode !== 'drag') {
      const c = this.padCenter();
      // generous catch zone around the pad so a sloppy thumb still lands
      if (Math.hypot(e.clientX - c.x, e.clientY - c.y) > this.R * 2.1) return;
      e.preventDefault();
      this.pointerId = e.pointerId;
      this.stick = { ox: c.x, oy: c.y, x: e.clientX, y: e.clientY };
      return;
    }
    e.preventDefault();
    this.pointerId = e.pointerId;
    this.stick = { ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
  };

  private move = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId || !this.stick) return;
    e.preventDefault();
    const s = this.stick;
    let dx = e.clientX - s.ox;
    let dy = e.clientY - s.oy;
    const d = Math.hypot(dx, dy);
    if (d > this.R && this.mode !== 'drag') {
      // fixed pad: the knob stops at the rim
      s.x = s.ox + (dx / d) * this.R;
      s.y = s.oy + (dy / d) * this.R;
      return;
    }
    if (d > this.R) {
      // drag the base along behind the thumb
      s.ox = e.clientX - (dx / d) * this.R;
      s.oy = e.clientY - (dy / d) * this.R;
      dx = e.clientX - s.ox;
      dy = e.clientY - s.oy;
    }
    s.x = e.clientX;
    s.y = e.clientY;
  };

  private up = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    this.release();
  };

  release() {
    this.pointerId = null;
    this.stick = null;
  }

  /** Movement vector with magnitude 0..1 */
  read(): [number, number] {
    let x = 0;
    let y = 0;
    const k = this.keys;
    if (k.has('a') || k.has('arrowleft')) x -= 1;
    if (k.has('d') || k.has('arrowright')) x += 1;
    if (k.has('w') || k.has('arrowup')) y -= 1;
    if (k.has('s') || k.has('arrowdown')) y += 1;
    if (x || y) {
      this.moved = true;
      const m = Math.hypot(x, y);
      return [x / m, y / m];
    }
    if (this.stick) {
      const dx = this.stick.x - this.stick.ox;
      const dy = this.stick.y - this.stick.oy;
      const d = Math.hypot(dx, dy);
      if (d < 6) return [0, 0];
      this.moved = true;
      // full speed from ~60% deflection: thumbs are imprecise
      const m = Math.min(1, d / (this.R * 0.6));
      return [(dx / d) * m, (dy / d) * m];
    }
    return [0, 0];
  }
}
