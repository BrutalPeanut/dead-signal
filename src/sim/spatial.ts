/**
 * Uniform spatial hash for broad-phase queries. Rebuilt every tick: with a few hundred
 * moving enemies a rebuild is cheaper and simpler than incremental updates.
 */
export class SpatialHash {
  private cells = new Map<number, number[]>();
  private pool: number[][] = [];
  constructor(public readonly cellSize: number) {}

  private key(cx: number, cy: number) {
    // pack two signed 16-bit ints
    return ((cx & 0xffff) << 16) | (cy & 0xffff);
  }

  clear() {
    for (const arr of this.cells.values()) {
      arr.length = 0;
      this.pool.push(arr);
    }
    this.cells.clear();
  }

  insert(id: number, x: number, y: number) {
    const k = this.key(Math.floor(x / this.cellSize), Math.floor(y / this.cellSize));
    let arr = this.cells.get(k);
    if (!arr) {
      arr = this.pool.pop() ?? [];
      this.cells.set(k, arr);
    }
    arr.push(id);
  }

  /** Calls fn for every id whose cell overlaps the circle's bounding box. */
  query(x: number, y: number, r: number, fn: (id: number) => void) {
    const cs = this.cellSize;
    const x0 = Math.floor((x - r) / cs);
    const x1 = Math.floor((x + r) / cs);
    const y0 = Math.floor((y - r) / cs);
    const y1 = Math.floor((y + r) / cs);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const arr = this.cells.get(this.key(cx, cy));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) fn(arr[i]);
      }
    }
  }
}
