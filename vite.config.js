import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Confirmed live (via the fatal-error safety net in index.html) on real
  // budget Android tablets: syntax the JS engine can't even parse (optional
  // chaining, nullish coalescing, optional catch binding, logical
  // assignment). Vite/esbuild's default target is newer than a lot of
  // real-world Android WebView/older-Chrome versions support. es2018 (not
  // es2015) specifically: Chrome 64/Android 8, the oldest confirmed device
  // this needs to run on, already has native async/await, object spread,
  // and Promise.finally (all ES2017-2018) -- down-leveling those into
  // regenerator-based ES5 would be pure overhead for zero benefit. It's
  // missing genuinely newer syntax (ES2019's optional catch binding,
  // ES2020's optional chaining/nullish coalescing) and runtime APIs syntax
  // transforms can't supply (globalThis, Array.flat/flatMap,
  // Object.fromEntries, Promise.allSettled) -- see src/polyfills.js for
  // those, imported first in main.jsx.
  build: {
    target: 'es2018',
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
  ],
  resolve: {
    alias: { '@': '/src' },
  },
})
