import { chromium } from 'playwright';
const [out, w = '1280', h = '760'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await page.goto('http://localhost:5173/previewD.html'); await page.waitForTimeout(6000); if (!(await page.evaluate(() => !!window.__pv))) { console.log('NOT READY', errs.join('\n')); process.exit(1); }
const shots = JSON.parse(process.env.SHOTS || '[["game",{}]]');
for (const [name, st] of shots) {
  await page.evaluate((s) => { Object.assign(window.__pv.state, s); window.__pv.applyState(); }, st);
  await page.waitForTimeout(+(process.env.WAIT || 2500));
  await page.screenshot({ path: `${out}/${name}.png` });
}
console.log(errs.length ? errs.slice(0, 8).join('\n') : 'no errors');
await browser.close();
