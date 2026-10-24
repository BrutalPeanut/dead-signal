// Inline the Vite build into one self-contained HTML body (for hosting as a Claude artifact).
// node scripts/singlefile.mjs <out.html>
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const out = process.argv[2] ?? 'dist/dead-signal.html';
const assets = readdirSync('dist/assets');
const css = readFileSync('dist/assets/' + assets.find((f) => f.endsWith('.css')), 'utf8');
const js = readFileSync('dist/assets/' + assets.find((f) => f.endsWith('.js')), 'utf8').replace(/<\/script/g, '<\\/script');
const html = `<title>Dead Signal</title>
<meta name="theme-color" content="#0b0d12">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Chakra+Petch:ital,wght@0,500;0,600;0,700;1,700&display=swap" rel="stylesheet">
<style>${css}</style>
<canvas id="game"></canvas>
<div id="ui"></div>
<script type="module">${js}</script>
`;
writeFileSync(out, html);
console.log(out, (html.length / 1024).toFixed(0) + ' KB');
