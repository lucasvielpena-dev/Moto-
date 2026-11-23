import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rota.entregadores',
  appName: 'Rota',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#0B0F17',
    allowMixedContent: false,
  },
};

export default config;
