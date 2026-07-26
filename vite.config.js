import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

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
  plugins: [
    react(),
    tailwindcss(),
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
