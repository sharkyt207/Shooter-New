/**
 * Capacitor configuration.
 *
 * The native shell around the same web build that runs in a browser. Nothing in
 * `src/` knows this file exists: every native capability is reached through an
 * adapter in `src/platform/**` that degrades to a web implementation when
 * Capacitor is not there (ADR-015).
 *
 * Generating and building the native projects needs a Mac with Xcode and
 * CocoaPods — see docs/modules/platform-mobile.md for the exact steps. This
 * file is the part that is the same everywhere.
 */

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.projectecho.game',
  appName: 'PROJECT ECHO',
  // Vite's output. `npm run build` produces it; `npx cap sync` copies it.
  webDir: 'dist',

  ios: {
    // The game draws its own background; a white flash between the splash and
    // the first frame is the cheapest way to look unfinished.
    backgroundColor: '#080A0F',
    // The canvas handles its own scrolling; rubber-banding the whole web view
    // during a raid is unplayable.
    scrollEnabled: false,
    contentInset: 'never',
  },

  android: {
    backgroundColor: '#080A0F',
    // Same reasoning as iOS.
    allowMixedContent: false,
  },

  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#080A0F',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#080A0F',
      overlaysWebView: true,
    },
  },
};

export default config;
