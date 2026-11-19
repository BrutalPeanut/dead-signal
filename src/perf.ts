/**
 * Slow-device check after a run: a 3D run with at least 15 s of measured play (frames slower than
 * 250 ms aren't counted, see main.ts) that averaged under 25 fps means this device should use the
 * classic 2D art. A player who picked 3D themselves in Settings ('3d') keeps it.
 */
export function tooSlowFor3d(is3d: boolean, setting: '3d' | '2d' | undefined, frames: number, ms: number): boolean {
  if (!is3d || setting === '3d' || ms < 15000) return false;
  return (frames * 1000) / ms < 25;
}
