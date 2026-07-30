export default {
  plugins: {
    tailwindcss: {},
    // CSS custom properties (var(--x)) aren't supported before Chrome 49 /
    // Safari 9.1 -- older than that and every var()-based declaration is
    // simply ignored, which is this app's *entire* color system (brand/
    // restaurant palettes are all rgb(var(--color-brand-600) / <alpha>),
    // for whitelabelTheme.js's runtime tenant-brand override -- see
    // tailwind.config.js). Without this, real 2014-era browsers wouldn't
    // crash, but every branded color would silently render as nothing.
    // preserve: true emits a static fallback (the computed literal value)
    // immediately before each var()-based declaration, then keeps the
    // var() line after it -- CSS applies declarations in order and simply
    // ignores ones it can't parse, so an old browser uses the fallback and
    // a capable one overrides it with the var() (whitelabel-aware) line.
    'postcss-custom-properties': { preserve: true },
    autoprefixer: {},
  },
}
