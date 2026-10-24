import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1600, height: 420 } });
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto('http://localhost:5173/' + process.argv[2]); await p.waitForTimeout(1500);
await p.screenshot({ path: process.argv[3] });
console.log(errs.join('\n') || 'ok');
await b.close();
