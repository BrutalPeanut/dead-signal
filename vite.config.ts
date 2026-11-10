import { defineConfig } from 'vite';
import pkg from './package.json';

const portalName = process.env.VITE_PORTAL ?? '';

export default defineConfig({
  base: './',
  // the settings footer shows package.json's version, so there's one place to bump it
  // __PORTAL__ = 'crazygames' builds the web-portal edition (see src/portal.ts); '' is the normal site
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __PORTAL__: JSON.stringify(portalName) },
  plugins: [
    {
      // portal edition: load the portal's SDK first, and drop the site-only tags
      name: 'portal-html',
      transformIndexHtml(html: string) {
        if (portalName !== 'crazygames') return html;
        return html
          .replace('</title>', '</title>\n    <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>')
          .replace(/\s*<link rel="manifest"[^>]*>/, '')
          .replace(/\s*<link rel="canonical"[^>]*>/, '');
      },
    },
  ],
  // rigged character models (Option D) are imported as assets
  assetsInclude: ['**/*.glb'],
  build: {
    target: 'es2020',
    outDir: portalName ? `dist-${portalName}` : 'dist',
    // inline small images/sounds, but ship fonts as cached files (the single-file build inlines them itself)
    assetsInlineLimit: (file: string) => (/\.(woff2?|ttf)$/.test(file) ? false : undefined),
  },
  server: { host: true },
});
