import { defineConfig } from 'vitest/config'

// Deliberately separate from vite.config.js -- that file's PWA/legacy-
// browser build plugins have nothing to do with running tests and aren't
// safe to evaluate outside an actual `vite build`/`vite dev` context. Only
// the one thing tests actually need (the @ import alias) is duplicated
// here.
export default defineConfig({
  resolve: {
    alias: { '@': '/src' },
  },
  test: {
    environment: 'node',
  },
})
