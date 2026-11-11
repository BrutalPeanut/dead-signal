import type { CapacitorConfig } from '@capacitor/cli';

// Google Play app shell. The web layer is `npm run build:android` (dist-android/); see src/native.ts.
const config: CapacitorConfig = {
  appId: 'info.deadsignal.game',
  appName: 'Dead Signal',
  // each platform's web layer is built separately (npm run build:android / build:ios)
  webDir: process.env.CAP_WEBDIR ?? 'dist-android',
  backgroundColor: '#0b0d14',
  android: { allowMixedContent: false, webContentsDebuggingEnabled: false },
};

export default config;
