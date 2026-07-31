// Colors are wired to CSS custom properties (declared in src/index.css),
// not static hex values -- two things depend on that: whitelabelTheme.js
// overriding a tenant's brand color at runtime, and opacity-modifier
// utilities (bg-brand-600/25) still working.
//
// Uses classic comma-separated rgba(), not the modern space-separated
// rgb(r g b / a) form -- confirmed on a real cheap Android tablet that the
// modern syntax fails to parse AT ALL on its WebView (needs Chrome 66+),
// silently dropping the whole declaration (buttons render with no
// background/text color -- exactly the "blue parts look black/white"
// symptom reported). rgba(var(--x), a) only needs CSS custom property
// support (Chrome 49+), a much lower bar, and --color-* variables in
// index.css store comma-separated channels to match.
function withOpacity(varName) {
  return ({ opacityValue }) => `rgba(var(${varName}), ${opacityValue ?? 1})`
}

const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']

function colorScale(name) {
  return Object.fromEntries(SHADES.map((shade) => [shade, withOpacity(`--color-${name}-${shade}`)]))
}

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: colorScale('brand'),
        restaurant: colorScale('restaurant'),
      },
    },
  },
  plugins: [],
}
