// Screenshot helper: node scripts/shot.mjs <url> <out.png> [width] [height] [waitMs] [evalJs]
import { chromium } from 'playwright';
const [url, out, w = '1200', h = '900', wait = '600', js] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(url);
await page.waitForTimeout(+wait);
if (js) { await page.evaluate(js); await page.waitForTimeout(400); }
await page.screenshot({ path: out });
if (errs.length) console.log('ERRORS:\n' + errs.join('\n'));
await browser.close();
