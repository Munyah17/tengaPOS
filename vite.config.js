import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import legacy from '@vitejs/plugin-legacy'

// Auto-incrementing build counter -- distinct from the curated changelog
// Super Admin publishes manually (src/pages/admin/SuperAdminVersions.jsx).
// That page answers "what changed and why"; this answers "has a build
// actually gone out since I made changes" at a glance, without anyone
// having to remember to log it. Bumped by 0.01 in closeBundle (fires only
// after `vite build` finishes writing output, i.e. a successful build) so
// the number shipped in THIS build is whatever the last successful build
// left behind, and the file is rewritten for the next one.
const BUILD_VERSION_FILE = fileURLToPath(new URL('./build-version.json', import.meta.url))
const currentBuildVersion = JSON.parse(readFileSync(BUILD_VERSION_FILE, 'utf-8')).version

function buildVersionPlugin() {
  return {
    name: 'tengapos-build-version',
    apply: 'build',
    closeBundle() {
      const next = (Math.round((parseFloat(currentBuildVersion) + 0.01) * 100) / 100).toFixed(2)
      writeFileSync(BUILD_VERSION_FILE, JSON.stringify({ version: next }, null, 2) + '\n')
    },
  }
}

export default defineConfig({
  define: {
    __BUILD_VERSION__: JSON.stringify(currentBuildVersion),
  },
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
    buildVersionPlugin(),
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
    // Real 2014-era device support (the oldest tablets this actually ships
    // on) needs more than es2018 + polyfills.js can give: a browser that
    // predates ES modules entirely (pre-Chrome 61) can't even parse
    // <script type="module">, no syntax/polyfill fix reaches that.
    // renderModernChunks: false is deliberate -- @vitejs/plugin-legacy's
    // default dual-bundle mode (a modern ESM build + a legacy fallback,
    // chosen at runtime via a feature-detection script) is EXACTLY what
    // broke the app for every browser, including ordinary modern desktop
    // ones, a few days ago: the detection script required import.meta.resolve,
    // an API newer than what plenty of "modern" browsers actually have, and
    // failing browsers hit a broken fallback path with no catchable error.
    // renderModernChunks: false removes that decision entirely -- there is
    // only ever one bundle, transpiled to these targets and loaded via
    // SystemJS for everyone, so there is nothing left to falsely detect.
    // Confirmed in the built output: a single plain <script> (not
    // type="module", not nomodule -- either of those would make a modern
    // browser skip or mis-load the one and only bundle that exists).
    legacy({
      targets: ['chrome >= 35', 'and_chr >= 35', 'and_uc >= 11', 'safari >= 7', 'ios_saf >= 7', 'samsung >= 2', 'firefox >= 30', 'not dead'],
      renderModernChunks: false,
      additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
    }),
  ],
  resolve: {
    alias: { '@': '/src' },
  },
})
