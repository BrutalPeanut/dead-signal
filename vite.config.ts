import { defineConfig } from 'vite';
import pkg from './package.json';

export default defineConfig({
  base: './',
  // the settings footer shows package.json's version, so there's one place to bump it
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // rigged character models (Option D) are imported as assets
  assetsInclude: ['**/*.glb'],
  build: {
    target: 'es2020',
    outDir: 'dist',
    // inline small images/sounds, but ship fonts as cached files (the single-file build inlines them itself)
    assetsInlineLimit: (file: string) => (/\.(woff2?|ttf)$/.test(file) ? false : undefined),
  },
  server: { host: true },
});
