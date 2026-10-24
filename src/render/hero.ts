import { INK, ao, ball, glow, limb, line, mat, paint, taper, type C } from './kit';

export interface HeroPose {
  t: number;
  moving: boolean;
  aim: number; // world angle the blaster points at
}

/** On-screen height of the courier in world units, and where the feet sit relative to the sim position. */
export const HERO_H = 52;
export const HERO_FOOT = 13;

const PANTS = mat('#2f3850', '#161b28', '#4a5674');
const PANTS_BACK = mat('#262d41', '#11151f', '#3a4560');
const BOOT = mat('#24262c', '#0c0d10', '#4a4e58', null);
const JACKET = mat('#ff8a2a', '#b2400a', '#ffc27a');
const JACKET_BACK = mat('#d9661a', '#8a2f06', '#f29a4a');
const PACK = mat('#4b5568', '#20252f', '#7a869c');
const HELMET = mat('#eef2f7', '#7d8a9c', '#ffffff');
const GLOVE = mat('#30343d', '#14161b', '#5a606c', null);
const GUN = mat('#5a6478', '#1f2430', '#8e9ab0', null);
const GUN_DARK = mat('#2c323f', '#12151c', '#4a5263', null);

/**
 * The courier. Design space: 100 units tall, feet at y=0, facing +x. The blaster arm is drawn in
 * a separate pass rotated toward the auto-aim target so the gun always points where shots go.
 */
export function drawHero(ctx: C, pose: HeroPose) {
  const facing = Math.cos(pose.aim) < 0 ? -1 : 1;
  const ph = pose.moving ? pose.t * 11 : 0;
  const s = Math.sin(ph);
  const bob = pose.moving ? -Math.abs(Math.cos(ph)) * 2.6 : Math.sin(pose.t * 2.4) * 0.9;
  const lean = pose.moving ? 0.07 : 0;
  const k = HERO_H / 100;

  ctx.save();
  ctx.translate(0, HERO_FOOT);
  ctx.scale(k * facing, k);

  // ---- legs (back leg first, darker)
  const step = pose.moving ? 1 : 0;
  const legs = (side: -1 | 1, m: typeof PANTS) => {
    const sw = s * side * step;
    const hipX = side * 4;
    const kneeX = hipX + sw * 7;
    const kneeY = -15 + Math.max(0, -sw) * 2.5;
    const footX = hipX + sw * 10;
    const footY = -3 + Math.max(0, -sw) * -3.5;
    limb(ctx, hipX, -29 + bob, kneeX, kneeY + bob * 0.4, footX, footY, [7, 6, 5.2], m);
    // knee pad
    ball(ctx, kneeX + 1.5, kneeY + bob * 0.4, 4, 3.4, mat('#59647c', '#2a3140', '#8592ad', null, 2));
    // boot
    paint(
      ctx,
      (c) => {
        c.roundRect(footX - 6, footY - 6, 15, 8, [3, 5, 2, 2]);
      },
      BOOT,
      footX - 6,
      footY - 6,
      15,
      8,
    );
    ctx.fillStyle = '#ff7a1a';
    ctx.fillRect(footX - 5, footY + 0.2, 13, 1.6);
  };
  legs(-1, PANTS_BACK);

  ctx.save();
  ctx.translate(0, bob);
  ctx.rotate(lean);

  // ---- backpack + antenna (behind the torso)
  paint(ctx, (c) => c.roundRect(-27, -68, 17, 36, 5), PACK, -27, -68, 17, 36);
  ctx.fillStyle = '#1b2029';
  ctx.fillRect(-24, -60, 11, 3);
  ctx.fillRect(-24, -52, 11, 3);
  ctx.save();
  ctx.shadowColor = '#5ef2ff';
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#5ef2ff';
  ctx.fillRect(-24, -44, 3, 7);
  ctx.restore();
  line(ctx, [-21, -68, -25, -86, -27, -110], 2.4, '#8e9ab0');
  line(ctx, [-21, -68, -25, -86, -27, -110], 0.9, '#cfd6e2');
  const blink = 0.6 + 0.4 * Math.sin(pose.t * 6);
  glow(ctx, -27, -111, 2.4 + blink, '#5ef2ff');
  // cable from pack to helmet
  line(ctx, [-12, -62, -6, -66, -4, -70], 2.2, '#1b2029');

  // ---- back arm (swings)
  const asw = pose.moving ? -s * 6 : Math.sin(pose.t * 2.4) * 1;
  limb(ctx, -9, -57, -12 + asw * 0.6, -45, -9 + asw, -35, [5.5, 4.6, 4.2], JACKET_BACK);
  ball(ctx, -9 + asw, -34, 4.6, 4.2, GLOVE);

  // ---- torso
  const torso = (c: C) => {
    c.moveTo(-15, -33);
    c.quadraticCurveTo(-18, -48, -15, -59);
    c.quadraticCurveTo(0, -65, 15, -59);
    c.quadraticCurveTo(18, -46, 15, -33);
    c.quadraticCurveTo(0, -27, -15, -33);
    c.closePath();
  };
  paint(ctx, torso, JACKET, -16, -64, 32, 36);
  // reflective tape, clipped to the jacket
  ctx.save();
  ctx.beginPath();
  torso(ctx);
  ctx.clip();
  const tape = ctx.createLinearGradient(-16, -46, 16, -41);
  tape.addColorStop(0, '#f4f8fb');
  tape.addColorStop(0.5, '#c8dce4');
  tape.addColorStop(0.55, '#ffffff');
  tape.addColorStop(1, '#9fb4bf');
  ctx.fillStyle = tape;
  ctx.fillRect(-18, -46, 36, 5);
  ctx.fillStyle = 'rgba(94,242,255,0.35)';
  ctx.fillRect(-18, -46, 36, 1.4);
  // shading under the chest
  ctx.fillStyle = 'rgba(80,20,0,0.18)';
  ctx.fillRect(-18, -38, 36, 8);
  ctx.restore();
  line(ctx, [-18, -46, 18, -46], 1.2, INK, 0.6);
  line(ctx, [-18, -41, 18, -41], 1.2, INK, 0.6);
  // zipper
  line(ctx, [3, -59, 4, -33], 1.4, '#7a2c06');
  // belt + pouches
  paint(ctx, (c) => c.roundRect(-16, -35, 32, 5, 2), mat('#4a3626', '#22170e', '#6e5440', null, 2), -16, -35, 32, 5);
  paint(ctx, (c) => c.roundRect(-14, -36, 8, 8, 2), mat('#5a4632', '#2a1e12', '#806650', null, 2), -14, -36, 8, 8);
  paint(ctx, (c) => c.roundRect(6, -36, 8, 8, 2), mat('#5a4632', '#2a1e12', '#806650', null, 2), 6, -36, 8, 8);
  ctx.fillStyle = '#c9a66b';
  ctx.fillRect(-1, -34.5, 3, 4);
  // collar
  paint(
    ctx,
    (c) => {
      c.moveTo(-11, -60);
      c.quadraticCurveTo(0, -55, 11, -60);
      c.lineTo(10, -65);
      c.quadraticCurveTo(0, -61, -10, -65);
      c.closePath();
    },
    mat('#e0661a', '#8a2f06', '#ff9a4a', null, 2),
    -11,
    -65,
    22,
    10,
  );
  // shoulder pad (front)
  ball(ctx, 11, -58, 7, 5.5, mat('#59647c', '#2a3140', '#8592ad'), -0.3);

  // ---- helmet
  const hx = 3;
  const hy = -80;
  ball(ctx, hx, hy, 21, 20, HELMET);
  // comms port on the back of the helmet: a flat plate, not a round 'eye'
  paint(ctx, (c) => c.roundRect(hx - 19, hy - 2, 7, 11, 2.5), mat('#9aa6b8', '#4a5466', '#d8dee8', null, 2), hx - 19, hy - 2, 7, 11);
  ctx.fillStyle = '#5ef2ff';
  ctx.fillRect(hx - 17, hy + 1, 3, 4);
  // orange crest stripe
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(hx, hy, 21, 20, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = '#ff7a1a';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(hx + 2, hy + 6, 22, Math.PI * 1.08, Math.PI * 1.62);
  ctx.stroke();
  ctx.restore();
  // visor glass
  const visor = (c: C) => {
    c.moveTo(hx + 1, hy - 9);
    c.quadraticCurveTo(hx + 19, hy - 13, hx + 21, hy - 2);
    c.quadraticCurveTo(hx + 21, hy + 9, hx + 12, hy + 10);
    c.quadraticCurveTo(hx + 2, hy + 9, hx + 1, hy + 1);
    c.closePath();
  };
  ctx.save();
  ctx.shadowColor = '#5ef2ff';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  visor(ctx);
  const vg = ctx.createLinearGradient(hx, hy - 12, hx + 20, hy + 10);
  vg.addColorStop(0, '#d8fdff');
  vg.addColorStop(0.35, '#5ef2ff');
  vg.addColorStop(1, '#0a6f8a');
  ctx.fillStyle = vg;
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  visor(ctx);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.moveTo(hx + 5, hy - 9);
  ctx.lineTo(hx + 10, hy - 10);
  ctx.lineTo(hx + 4, hy + 6);
  ctx.lineTo(hx + 1, hy + 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(hx + 13, hy - 9, 2.5, 16);
  ctx.restore();
  ctx.beginPath();
  visor(ctx);
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // chin guard
  paint(ctx, (c) => c.roundRect(hx + 4, hy + 11, 13, 5, 2.5), mat('#3a414e', '#1a1e26', '#5f6878', null, 2), hx + 4, hy + 11, 13, 5);

  ctx.restore(); // torso lean/bob

  // front leg last (in front of torso hem)
  legs(1, PANTS);
  ao(ctx, 0, -30, 14, 4, 0.18);
  ctx.restore();

  // ---- blaster arm: rotated toward the aim in local (possibly mirrored) space
  ctx.save();
  ctx.translate(0, HERO_FOOT);
  ctx.scale(k * facing, k);
  ctx.translate(9, -57 + bob);
  const local = facing > 0 ? pose.aim : Math.PI - pose.aim;
  ctx.rotate(local);
  paint(ctx, taper(0, 0, 5.8, 13, 1, 4.8), JACKET, -6, -6, 22, 12);
  ball(ctx, 13, 1, 4.4, 4.2, mat('#e0661a', '#8a2f06', '#ff9a4a', null, 2));
  paint(ctx, taper(13, 1, 4.4, 22, 1.5, 4.2), GLOVE, 9, -4, 16, 10);
  // blaster
  paint(ctx, (c) => c.roundRect(17, -5.5, 24, 9, [3, 4, 4, 3]), GUN, 17, -5.5, 24, 9);
  paint(ctx, (c) => c.roundRect(39, -3.5, 9, 5, 1.5), GUN_DARK, 39, -3.5, 9, 5);
  paint(ctx, (c) => c.roundRect(21, 3, 6, 8, 2), GUN_DARK, 21, 3, 6, 8);
  ctx.save();
  ctx.shadowColor = '#5ef2ff';
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#5ef2ff';
  ctx.fillRect(24, -2.6, 12, 2.6);
  ctx.restore();
  glow(ctx, 48.5, -1, 1.6, '#5ef2ff');
  ctx.restore();
}
