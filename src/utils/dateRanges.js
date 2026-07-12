// Shared date-range presets for exports and analytics.
// "This week" runs Monday (week start) through the current moment.
export const DATE_PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'this_week', label: 'This Week' },
  { key: 'last_week', label: 'Last Week' },
  { key: 'this_month', label: 'This Month' },
  { key: '3months', label: 'Last 3 Months' },
  { key: 'year', label: 'This Year' },
  { key: 'custom', label: 'Custom Range' },
]

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function mondayOf(d) {
  const day = d.getDay() === 0 ? 7 : d.getDay() // Mon=1 ... Sun=7
  const monday = new Date(d)
  monday.setDate(monday.getDate() - (day - 1))
  return monday
}

export function getPresetRange(key) {
  const now = new Date()
  const today = startOfDay(now)

  switch (key) {
    case 'today':
      return { start: today, end: now }
    case 'yesterday': {
      const y = new Date(today)
      y.setDate(y.getDate() - 1)
      return { start: y, end: today }
    }
    case 'this_week':
      return { start: mondayOf(today), end: now }
    case 'last_week': {
      const thisMonday = mondayOf(today)
      const lastMonday = new Date(thisMonday)
      lastMonday.setDate(lastMonday.getDate() - 7)
      return { start: lastMonday, end: thisMonday }
    }
    case 'this_month':
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now }
    case '3months': {
      const d = new Date(today)
      d.setMonth(d.getMonth() - 3)
      return { start: d, end: now }
    }
    case 'year':
      return { start: new Date(now.getFullYear(), 0, 1), end: now }
    default:
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now }
  }
}
