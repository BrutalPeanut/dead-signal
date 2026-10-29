// Gameplay backtest through the real browser build with the 3D renderer drawing every frame.
// For each sector: a fresh, seeded campaign run driven by the game's own autopilot (the same bot
// the balance sim uses), stepping the sim at its fixed rate and rendering between steps.
// Reports outcome, time, level, kills and render errors; RENDERER=2d runs the same seeds in 2D
// so the two can be diffed (the sim must not care which renderer is on).
// node scripts/backtest3d.mjs [url] [sectors]
import { chromium } from 'playwright';
const [url = 'http://localhost:5173/', list = '0,1,2,4,9,12'] = process.argv.slice(2);
const R = process.env.RENDERER ?? '3d';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 300, height: 560 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message)));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('ERR_TUNNEL') && errs.push(m.text()));
await page.goto(url + '?fresh&r=' + R);
await page.waitForTimeout(2500);
await page.click('.modal .btn').catch(() => {});
const rows = [];
for (const s of list.split(',').map(Number)) {
  const res = await page.evaluate(async ([sector, ATK, HP]) => {
    const { Game, DT } = await import('/src/sim/game.ts');
    const { getChapter } = await import('/src/sim/chapters.ts');
    const { botChoose, botMove } = await import('/src/sim/bot.ts');
    const app = window.__ds.app;
    // same kit and seed as scripts/balance.ts
    const base = { atk: ATK, hp: HP, def: 0, crit: 0.05, critMul: 1.5, moveSpeed: 92, pickup: 46, healMul: 1, goldMul: 1, rerolls: 2, revives: 0, startWeapon: 'pistol', startLevels: 0, regen: 0 };
    const g = new Game(getChapter(sector), base, 1000);
    app.startRun(sector, 'campaign');
    app.game = g;
    app.renderer.setGame(g);
    // cheapest tier: this exercises every render path, it isn't a visual check
    if (app.renderer.setTier) app.renderer.setTier(0);
    if (app.renderer.adapt) app.renderer.adapt = () => {};
    // the headless balance sim's default view, so results must match it run for run
    g.viewW = 210;
    g.viewH = 380;
    app.renderer.fitCamera?.();
    app.paused = true; // the page loop must not also step this game
    let steps = 0, frames = 0, renderMs = 0, worst = 0;
    const bosses = new Set();
    while (g.state !== 'dead' && g.state !== 'won' && steps < 60 * 60 * 12) {
      if (g.state === 'levelup') g.choose(botChoose(g, g.offers));
      else if (g.state === 'chest') g.closeChest();
      else if (g.state === 'revive') g.revive(false);
      const [mx, my] = botMove(g);
      g.step(mx, my);
      steps++;
      if (g.boss) bosses.add(g.boss.boss);
      // render every 20th step (3 fps of sim time): every boss, effect and death still gets drawn
      if (steps % 20 === 0) {
        const t0 = performance.now();
        app.renderer.render(DT * 20);
        const ms = performance.now() - t0;
        renderMs += ms;
        worst = Math.max(worst, ms);
        frames++;
      }
      if (steps % 200 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    app.paused = false;
    return { sector: sector + 1, won: g.state === 'won', t: Math.round(g.time), L: g.level, kills: g.kills, bosses: [...bosses].join('+'), frames, avgCpuMs: +(renderMs / frames).toFixed(1), worstMs: Math.round(worst) };
  }, [s, +(process.env.ATK ?? 20), +(process.env.HP ?? 200)]);
  rows.push(res);
  console.log(JSON.stringify(res));
}
console.log(errs.length ? 'ERRORS:\n' + [...new Set(errs)].slice(0, 10).join('\n') : 'no render errors');
await browser.close();
