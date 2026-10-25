// Inline the Vite build into one self-contained HTML body (for hosting as a Claude artifact).
// node scripts/singlefile.mjs <out.html>
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const out = process.argv[2] ?? 'dist/dead-signal.html';
const assets = readdirSync('dist/assets');
// inline bundled fonts as data URIs so the single file needs nothing else
const css = readFileSync('dist/assets/' + assets.find((f) => f.endsWith('.css')), 'utf8').replace(/url\(([^)]+?\.(woff2|woff))\)/g, (m, u) => {
  const name = u.replace(/^.*\//, '').replace(/["']/g, '');
  if (!assets.includes(name)) return m;
  if (u.endsWith('woff')) return 'url(data:,)';
  return `url(data:font/woff2;base64,${readFileSync('dist/assets/' + name).toString('base64')})`;
});
const js = readFileSync('dist/assets/' + assets.find((f) => f.endsWith('.js')), 'utf8').replace(/<\/script/g, '<\\/script');
const html = `<title>Dead Signal</title>
<meta name="theme-color" content="#0b0d12">
<style>${css}</style>
<canvas id="game"></canvas>
<div id="ui"></div>
<script type="module">${js}</script>
`;
writeFileSync(out, html);
console.log(out, (html.length / 1024).toFixed(0) + ' KB');
