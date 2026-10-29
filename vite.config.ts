import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
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
