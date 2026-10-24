/**
 * Floating virtual joystick: touch anywhere, drag to move. The stick re-centres when the thumb
 * strays past the rim so you never "run out" of stick. Keyboard (WASD / arrows) for desktop.
 */
export class Input {
  mx = 0;
  my = 0;
  stick: { ox: number; oy: number; x: number; y: number } | null = null;
  private pointerId: number | null = null;
  private keys = new Set<string>();
  private readonly R = 52;
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

  private down = (e: PointerEvent) => {
    if (!this.enabled || this.pointerId !== null) return;
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
