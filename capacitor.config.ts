import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.palab.app',
  appName: 'Palab',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
  },
  plugins: {
    // 用原生 HTTP 代替 WebView fetch，规避 CORS / fetch 失败
    CapacitorHttp: { enabled: true },
    CapacitorCookies: { enabled: true },
  }
};

export default config;
