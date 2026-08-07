import { describe, it, expect } from 'vitest'
import { parseOptionalNumber, parseOptionalMoney } from './formatters'

// Regression coverage for the "blank means not entered, 0 means
// explicitly zero" distinction Mass Import and the product form both
// depend on. These two are the single source of truth every price/stock
// write path (insertProduct, updateProduct, bulkInsertProducts) goes
// through -- a bug here is a bug everywhere at once.
describe('parseOptionalNumber', () => {
  it('treats blank string as "not entered" (null)', () => {
    expect(parseOptionalNumber('')).toBeNull()
  })
  it('treats undefined as "not entered" (null)', () => {
    expect(parseOptionalNumber(undefined)).toBeNull()
  })
  it('treats null as "not entered" (null)', () => {
    expect(parseOptionalNumber(null)).toBeNull()
  })
  it('preserves an explicit zero as exactly 0, not null', () => {
    expect(parseOptionalNumber('0')).toBe(0)
    expect(parseOptionalNumber(0)).toBe(0)
  })
  it('preserves decimal quantities exactly, not truncated', () => {
    expect(parseOptionalNumber('71.5')).toBe(71.5)
    expect(parseOptionalNumber('2.5')).toBe(2.5)
  })
  it('parses a whole-number string', () => {
    expect(parseOptionalNumber('190')).toBe(190)
  })
  it('falls back to null for garbage input', () => {
    expect(parseOptionalNumber('not a number')).toBeNull()
  })
})

describe('parseOptionalMoney', () => {
  it('treats blank string as "not priced" (null)', () => {
    expect(parseOptionalMoney('')).toBeNull()
  })
  it('preserves an explicit $0.00 as exactly 0, not null', () => {
    expect(parseOptionalMoney('0.00')).toBe(0)
    expect(parseOptionalMoney(0)).toBe(0)
  })
  it('rounds to 2 decimal places', () => {
    expect(parseOptionalMoney('4.999')).toBe(5)
    expect(parseOptionalMoney('9.999999999999998')).toBe(10)
  })
  it('parses a normal price', () => {
    expect(parseOptionalMoney('2.20')).toBe(2.2)
  })
})
