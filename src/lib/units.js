// Hardware Mode only — items commonly sold by weight/length/volume rather
// than whole units. "each" is the default everywhere else and stays
// invisible/unused for tenants who never touch it (Inventory.jsx only
// shows the picker when posMode === 'hardware').
export const UNITS = [
  { key: 'each', label: 'Each' },
  { key: 'kg', label: 'Kilogram (kg)' },
  { key: 'g', label: 'Gram (g)' },
  { key: 'm', label: 'Metre (m)' },
  { key: 'cm', label: 'Centimetre (cm)' },
  { key: 'l', label: 'Litre (L)' },
  { key: 'ml', label: 'Millilitre (mL)' },
  { key: 'box', label: 'Box' },
  { key: 'bag', label: 'Bag' },
  { key: 'roll', label: 'Roll' },
  { key: 'ton', label: 'Ton' },
]

// Units where a fractional quantity makes sense (2.5kg, 3.75m) — POS's
// quantity stepper switches from integer +/-1 to decimal entry for these.
export const FRACTIONAL_UNITS = ['kg', 'g', 'm', 'cm', 'l', 'ml']

export function unitStep(unit) {
  return unit === 'g' || unit === 'ml' ? 1 : unit === 'kg' || unit === 'l' || unit === 'm' || unit === 'cm' ? 0.1 : 1
}
