import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import legacy from '@vitejs/plugin-legacy'

export default defineConfig({
  // Confirmed live (via the fatal-error safety net in index.html) on a real
  // budget Android tablet: "Uncaught SyntaxError: Unexpected token" -- the
  // page loads completely over the network but the browser's JS engine
  // can't even parse the bundle. Vite 8's default output target is more
  // modern than what a lot of real-world Android WebView/older-Chrome
  // devices support. Pinning an explicit, conservative target makes esbuild/
  // rolldown down-level syntax (optional chaining, nullish coalescing,
  // class fields, etc.) instead of emitting it as-is.
  build: {
    target: 'es2015',
  },
  // Tailwind runs through PostCSS now (postcss.config.js + tailwind.config.js)
  // instead of the @tailwindcss/vite plugin -- see index.css for why (v3, not
  // v4, for old-Android CSS compatibility).
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'robots.txt'],
      manifest: {
        name: 'tengaPOS - Cloud POS & Inventory',
        short_name: 'tengaPOS',
        description: 'Premium cloud-based POS and Inventory Management System for African SMEs',
        theme_color: '#1e40af',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/favicon.png', sizes: '192x192', type: 'image/png' },
          { src: '/favicon.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // GET only — the Cache Storage API can't store a POST/PATCH/DELETE
            // response at all. Without this, Workbox tried to cache.put() the
            // response to every auth token exchange and mutation (which are
            // POST), threw, and the rejected promise surfaced to the app as a
            // bare "Failed to fetch" on login and on every write.
            urlPattern: /^https:\/\/.*supabase\.co\/.*/i,
            method: 'GET',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 },
              networkTimeoutSeconds: 10,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
    // build.target: 'es2015' above only downlevels syntax within a modern
    // ES-module bundle -- it does nothing for a WebView that predates ES
    // modules/dynamic import() entirely (pre-Chrome 61/63), which is common
    // on the cheap Android tablets most tenants actually run this on as a
    // POS terminal. Those can't even parse <script type="module">, so no
    // syntax-level fix reaches them. This plugin builds a second, ES5 +
    // core-js-polyfilled bundle loaded via SystemJS behind <script nomodule>
    // -- modern browsers ignore it entirely and load the existing bundle,
    // old ones fall back to this automatically.
    // Same explicit version floors as package.json's browserslist -- a bare
    // 'Android >= 5' query resolves almost uselessly (caniuse only tracks one
    // current "android" entry, not real historical WebView versions), so it
    // was barely reaching further back than whatever "defaults" alone gave.
    // Naming actual old Chrome/Android-Chrome/Safari floors is what actually
    // targets the old cheap-tablet WebViews this exists for.
    legacy({
      targets: ['chrome >= 49', 'and_chr >= 49', 'and_uc >= 12', 'safari >= 10', 'ios_saf >= 10', 'samsung >= 5', 'firefox >= 50', 'not dead'],
      modernPolyfills: true,
      // core-js covers ECMAScript syntax/APIs, but neither of these is
      // ECMAScript: async/await needs the regenerator runtime once it's
      // transformed down to generators for these targets, and fetch (used
      // throughout by the Supabase client) is a browser API some of these
      // Android WebView versions predate entirely. Without both, the legacy
      // bundle parses fine but throws the moment it hits the first await or
      // network call.
      additionalLegacyPolyfills: ['regenerator-runtime/runtime', 'whatwg-fetch'],
    }),
  ],
  resolve: {
    alias: { '@': '/src' },
  },
})
