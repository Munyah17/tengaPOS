// Runtime API polyfills for older-but-still-ESM-capable browsers (e.g.
// Chrome 64 / Android 8 WebView, still common on cheap POS tablets).
//
// Distinct problem from the module-loading issue that @vitejs/plugin-legacy
// was (wrongly) added for: Chrome 64 already supports ES modules and
// dynamic import() natively (landed Chrome 61/63), so it loads and parses
// this bundle just fine -- it's missing specific ES2019+ *runtime APIs*
// that both this codebase (Array.flatMap, Object.fromEntries,
// Promise.allSettled, the ||= operator) and dependencies bundled into it
// (React 19 and others assume globalThis exists) call directly. No syntax
// transform can supply a missing global -- only a real polyfill can.
//
// core-js/stable is deliberately broad rather than a hand-picked list: the
// gap-list above is only what's directly visible in this codebase's own
// source, but plenty more comes from inside bundled dependencies where an
// exhaustive audit isn't practical. Every core-js polyfill no-ops when the
// native implementation already exists, so this is a no-cost pass-through
// on modern browsers -- it does not change behavior for anyone already
// working today.
//
// Must be the very first import anywhere reachable from the entrypoint, so
// every one of these exists before any other module (including
// dependencies) has a chance to run and assume it does.
import 'core-js/stable'
