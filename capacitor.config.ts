import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.rdr',
  appName: 'rdr',
  webDir: 'dist',
  backgroundColor: '#f4f2f7',
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 500,
      launchAutoHide: true,
      backgroundColor: '#f4f2f7',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    // The app repaints this from the active palette; LIGHT matches the paper
    // splash (dark icons) until the web layer takes over.
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#f4f2f7',
      overlaysWebView: false,
    },
    Keyboard: {
      resize: 'native',
      resizeOnFullScreen: true,
    },
  },
}

export default config
