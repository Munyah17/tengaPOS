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

// core-js is ECMAScript-standard-library only (Object/Array/Promise/etc) --
// it does NOT cover Web/DOM APIs, which is a separate spec track entirely.
// Confirmed live: "AbortController is not defined", thrown as soon as the
// first data fetch ran (React Query and the Supabase client both construct
// one internally to cancel in-flight requests) -- got past module loading
// and the initial render, then crashed on the very first network call.
// whatwg-fetch first: real 2014-era targets (Chrome 35, Safari 7) predate
// native fetch entirely (landed Chrome 42/Safari 10.1), so without this,
// EVERY request in this cloud-based app fails outright, not just aborts.
// polyfill-patch-fetch after it: supplies AbortController/AbortSignal and
// patches whichever fetch now exists (native or just-polyfilled) to
// actually honor the `signal` option, since a plain fetch polyfill on its
// own doesn't understand abort signals.
import 'whatwg-fetch'
import 'abortcontroller-polyfill/dist/polyfill-patch-fetch'
