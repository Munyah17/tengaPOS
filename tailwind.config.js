// Colors are wired to CSS custom properties (declared in src/index.css),
// not static hex values -- two things depend on that: whitelabelTheme.js
// overriding a tenant's brand color at runtime, and opacity-modifier
// utilities (bg-brand-600/25) still working, which needs the plain
// rgb(var(--x) / <alpha>) form rather than a value Tailwind can't decompose
// into channels at build time.
function withOpacity(varName) {
  return ({ opacityValue }) => {
    if (opacityValue === undefined) return `rgb(var(${varName}))`
    return `rgb(var(${varName}) / ${opacityValue})`
  }
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
