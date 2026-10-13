import type { CapacitorConfig } from '@capacitor/cli';

// Android-App (Play Store): dieselbe Web-App, gebaut mit `npm run build:native` nach dist/
const config: CapacitorConfig = {
  appId: 'de.timelytix.app',
  appName: 'Timelytix',
  webDir: 'dist',
  android: {
    // Kein Zugriff auf http:// nötig
    allowMixedContent: false,
  },
  plugins: {
    // Randlos bis unter die Statusleiste; die App hält den Abstand selbst frei (env(safe-area-inset-*))
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_timelytix',
      iconColor: '#2563eb',
    },
  },
};

export default config;
