// Packs a portal build (dist-<portal>/) into a zip ready to upload to the portal's developer site.
// Leaves out files that only matter on deadsignal.info (ads.txt, CNAME, web manifest, robots, sitemap).
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const portal = process.argv[2];
const dir = `dist-${portal}`;
if (!portal || !existsSync(dir)) {
  console.error(`No ${dir}/ — run the portal build first`);
  process.exit(1);
}
for (const f of ['ads.txt', 'CNAME', 'manifest.webmanifest', 'robots.txt', 'sitemap.xml', 'og.png', 'og.jpg']) rmSync(join(dir, f), { force: true });
for (const f of readdirSync(dir)) if (/^google[0-9a-f]+\.html$/.test(f)) rmSync(join(dir, f)); // Search Console verification
const zip = `dead-signal-${portal}.zip`;
rmSync(zip, { force: true });
execFileSync('zip', ['-r', '-q', '-X', `../${zip}`, '.'], { cwd: dir });
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [statSync(join(d, e.name)).size]));
const sizes = walk(dir);
console.log(`${zip}: ${(statSync(zip).size / 1e6).toFixed(1)} MB zipped, ${sizes.length} files, ${(sizes.reduce((a, b) => a + b, 0) / 1e6).toFixed(1)} MB unpacked`);
