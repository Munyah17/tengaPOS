import { useState, useEffect } from 'react'
import { toLocalDateStr } from '@/utils/formatters'

// Orders/Transactions both default to "just today" instead of dumping the
// entire history on screen, while still letting staff pick any other
// date/range with the same filter inputs. Reported live: a register/tablet
// left open overnight should flip back to showing *today's* orders on its
// own once midnight passes, not stay pinned to whatever day was selected
// when the tab was opened -- this schedules a real midnight-aligned timer
// for that (not a poll), and only touches the filter if it still matches
// what "today" was when the timer was armed, so a deliberately-picked
// other date is never silently overwritten.
export function useDayFilter() {
  const [dateFrom, setDateFrom] = useState(() => toLocalDateStr())
  const [dateTo, setDateTo] = useState(() => toLocalDateStr())
  const [timeFrom, setTimeFrom] = useState('')
  const [timeTo, setTimeTo] = useState('')

  const resetToToday = () => {
    const t = toLocalDateStr()
    setDateFrom(t)
    setDateTo(t)
    setTimeFrom('')
    setTimeTo('')
  }

  useEffect(() => {
    let timeoutId
    const arm = () => {
      const todaySnapshot = toLocalDateStr()
      const now = new Date()
      // A few seconds past midnight, not exactly on it -- avoids firing
      // a tick early on a clock/timer resolution edge.
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5)
      timeoutId = setTimeout(() => {
        setDateFrom((d) => (d === todaySnapshot ? toLocalDateStr() : d))
        setDateTo((d) => (d === todaySnapshot ? toLocalDateStr() : d))
        arm()
      }, Math.max(1000, next.getTime() - now.getTime()))
    }
    arm()
    return () => clearTimeout(timeoutId)
  }, [])

  const isToday = dateFrom === toLocalDateStr() && dateTo === toLocalDateStr() && !timeFrom && !timeTo

  return { dateFrom, dateTo, timeFrom, timeTo, setDateFrom, setDateTo, setTimeFrom, setTimeTo, resetToToday, isToday }
}
