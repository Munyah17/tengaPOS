import { describe, it, expect } from 'vitest'
import { parseCSVBuffer, filterValidImportRows, shapeRows } from './exportUtils'

function toBuffer(text) {
  return new TextEncoder().encode(text).buffer
}

const HEADERS = 'name,sku,barcode,price,landing_price,stock,low_stock_threshold,brand,vat_treatment,weight,volume,color,size'

describe('parseCSVBuffer', () => {
  // Regression: a real Excel "CSV UTF-8" export corrupted the "name"
  // header down to "me" when the raw bytes were handed to XLSX with a
  // buffer/codepage hint instead of being decoded to text and having the
  // BOM stripped first -- every row then failed validation with no
  // indication why. This is the exact byte sequence Excel writes.
  it('parses a file with a UTF-8 BOM correctly (header stays "name", not "me")', () => {
    const bom = '﻿'
    const csv = `${bom}${HEADERS}\nTwine bag,TWINE-BAG,,,,190,,,,,,,\n`
    const rows = parseCSVBuffer(toBuffer(csv))
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Twine bag')
    expect(Object.keys(rows[0])).toContain('name')
    expect(Object.keys(rows[0])).not.toContain('﻿name')
  })

  it('parses a plain file with no BOM the same way', () => {
    const csv = `${HEADERS}\nTwine bag,TWINE-BAG,,,,190,,,,,,,\n`
    const rows = parseCSVBuffer(toBuffer(csv))
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Twine bag')
  })

  it('normalizes header casing/whitespace', () => {
    const csv = ' Name , SKU \nTwine bag,TWINE-BAG\n'
    const rows = parseCSVBuffer(toBuffer(csv))
    expect(rows[0].name).toBe('Twine bag')
    expect(rows[0].sku).toBe('TWINE-BAG')
  })

  it('leaves blank price/stock cells as blank strings, not coerced to 0', () => {
    const csv = `${HEADERS}\nTwine bag,TWINE-BAG,,,,190,,,,,,,\n`
    const rows = parseCSVBuffer(toBuffer(csv))
    expect(rows[0].price).toBe('')
    expect(rows[0].stock).toBe('190')
  })

  it('preserves a decimal stock value exactly (e.g. 71.5)', () => {
    const csv = `${HEADERS}\nCompound D,COMPOUND-D,,0.00,0.00,71.5,0,,standard,,,,\n`
    const rows = parseCSVBuffer(toBuffer(csv))
    expect(rows[0].stock).toBe('71.5')
  })
})

// filterValidImportRows is the actual predicate Mass Import runs every row
// through -- these are the exact scenarios reported as broken (rows with
// only some fields filled in getting silently rejected).
describe('filterValidImportRows', () => {
  it('accepts a row with only a name', () => {
    const rows = filterValidImportRows([{ name: 'Twine bag', price: '', stock: '' }])
    expect(rows).toHaveLength(1)
  })
  it('accepts name + price, no stock', () => {
    const rows = filterValidImportRows([{ name: 'Twine bag', price: '4.50', stock: '' }])
    expect(rows).toHaveLength(1)
  })
  it('accepts name + stock, no price', () => {
    const rows = filterValidImportRows([{ name: 'Twine bag', price: '', stock: '190' }])
    expect(rows).toHaveLength(1)
  })
  it('accepts name + price + stock', () => {
    const rows = filterValidImportRows([{ name: 'Twine bag', price: '4.50', stock: '190' }])
    expect(rows).toHaveLength(1)
  })
  it('accepts an explicit zero price', () => {
    const rows = filterValidImportRows([{ name: 'Twine bag', price: '0.00', stock: '190' }])
    expect(rows).toHaveLength(1)
  })
  it('accepts an explicit zero stock', () => {
    const rows = filterValidImportRows([{ name: 'Twine bag', price: '4.50', stock: '0' }])
    expect(rows).toHaveLength(1)
  })
  it('accepts a decimal stock quantity', () => {
    const rows = filterValidImportRows([{ name: 'Compound D', price: '0.00', stock: '71.5' }])
    expect(rows).toHaveLength(1)
  })
  it('rejects a row with no name', () => {
    const rows = filterValidImportRows([{ name: '', price: '4.50', stock: '190' }])
    expect(rows).toHaveLength(0)
  })
})

// Regression: CSV/Excel/Access exports used to ignore the columns prop
// entirely and dump the raw row object (id, tenant_id, created_at, and
// other internal database fields), making an exported product list
// useless as a re-import template for anyone else.
describe('shapeRows', () => {
  const columns = [
    { header: 'name', key: 'name' },
    { header: 'price', key: 'price' },
  ]
  const rawRow = { id: 'abc-123', tenant_id: 'tenant-xyz', name: 'Twine bag', price: 4.5, created_at: '2026-01-01' }

  it('keeps only the specified columns, dropping internal fields', () => {
    const [shaped] = shapeRows([rawRow], columns)
    expect(shaped).toEqual({ name: 'Twine bag', price: 4.5 })
    expect(shaped).not.toHaveProperty('id')
    expect(shaped).not.toHaveProperty('tenant_id')
    expect(shaped).not.toHaveProperty('created_at')
  })

  it('passes data through unchanged when no columns are given', () => {
    const [shaped] = shapeRows([rawRow], undefined)
    expect(shaped).toBe(rawRow)
  })
})
