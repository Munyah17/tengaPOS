// Contract tests for the desktop-license shared logic — the same file
// the edge function imports (supabase/functions/_shared/license-utils.ts),
// run under Node so canonicalisation/semver/rollout behaviour is locked
// to the contract in docs/desktop-license-api-v1.md.
import { describe, it, expect } from 'vitest'
import {
  canonicalize, semverCmp, rolloutBucket, generateCode,
  sha256hex, sha256b64, b64encode, b64decode, hexToB64,
} from '../../supabase/functions/_shared/license-utils.ts'

describe('canonicalize (contract §1 — signature bytes)', () => {
  it('sorts object keys recursively', () => {
    expect(canonicalize({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}')
  })
  it('produces compact output (no whitespace)', () => {
    expect(canonicalize({ a: 1, b: [1, 2] })).toBe('{"a":1,"b":[1,2]}')
  })
  it('is order-independent — same fields, same bytes', () => {
    const a = { version: '1.0.0', channel: 'stable', rollout_pct: 25 }
    const b = { rollout_pct: 25, channel: 'stable', version: '1.0.0' }
    expect(canonicalize(a)).toBe(canonicalize(b))
  })
  it('detects tampering — changing any field changes the canonical bytes', () => {
    const lease = { device_id: 'x', expires_at: '2026-12-01T00:00:00Z' }
    const forged = { ...lease, expires_at: '2027-12-01T00:00:00Z' }
    expect(canonicalize(lease)).not.toBe(canonicalize(forged))
  })
  it('handles arrays, nulls, nested structures', () => {
    expect(canonicalize({ a: null, b: [{ y: 1, x: [true, null] }] }))
      .toBe('{"a":null,"b":[{"x":[true,null],"y":1}]}')
  })
})

describe('semverCmp', () => {
  it('orders versions correctly', () => {
    expect(semverCmp('1.5.0', '1.4.0')).toBe(1)
    expect(semverCmp('1.4.0', '1.5.0')).toBe(-1)
    expect(semverCmp('1.4.0', '1.4.0')).toBe(0)
    expect(semverCmp('2.0.0', '10.0.0')).toBe(-1)
  })
  it('treats missing segments as 0', () => {
    expect(semverCmp('1.4', '1.4.0')).toBe(0)
    expect(semverCmp('0.0.0', '0.0.1')).toBe(-1)
  })
  it('drives min_supported_version force-update logic', () => {
    // current < min → mandatory update
    expect(semverCmp('1.1.9', '1.2.0')).toBe(-1)
    expect(semverCmp('1.2.0', '1.2.0')).toBe(0)
  })
})

describe('rolloutBucket (contract §2.5 — staged rollout)', () => {
  it('is deterministic for the same device+version', async () => {
    const a = await rolloutBucket('device-1', '1.5.0')
    const b = await rolloutBucket('device-1', '1.5.0')
    expect(a).toBe(b)
  })
  it('returns 0–99', async () => {
    for (let i = 0; i < 25; i++) {
      const b = await rolloutBucket(`dev-${i}`, '1.5.0')
      expect(b).toBeGreaterThanOrEqual(0)
      expect(b).toBeLessThan(100)
    }
  })
  it('same device gets different buckets across versions', async () => {
    const buckets = new Set()
    for (let v = 0; v < 10; v++) buckets.add(await rolloutBucket('device-1', `1.${v}.0`))
    expect(buckets.size).toBeGreaterThan(1)
  })
  it('roughly distributes: ~rollout_pct% of devices see the update', async () => {
    let inside = 0
    const N = 200
    for (let i = 0; i < N; i++) {
      if (await rolloutBucket(`dev-${i}`, '1.5.0') < 25) inside++
    }
    // Expect ~50 of 200; generous bound avoids flake
    expect(inside).toBeGreaterThan(15)
    expect(inside).toBeLessThan(100)
  })
})

describe('generateCode', () => {
  it('matches the TGA-XXXX-XXXX contract format', () => {
    expect(generateCode()).toMatch(/^TGA-[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}$/)
  })
  it('never emits ambiguous characters (0,O,1,I,L,U)', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateCode()).not.toMatch(/[01OILU]/)
    }
  })
  it('is unique across calls', () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateCode()))
    expect(codes.size).toBe(100)
  })
})

describe('hashing + encoding helpers', () => {
  it('sha256hex matches a known vector', async () => {
    // sha256("abc") — canonical test vector
    expect(await sha256hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
  it('sha256b64 produces valid base64 of 32-byte digest', async () => {
    const b64 = await sha256b64('abc')
    expect(b64decode(b64).length).toBe(32)
  })
  it('b64 encode/decode round-trips', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255])
    expect([...b64decode(b64encode(bytes))]).toEqual([...bytes])
  })
  it('hexToB64 converts sha256 hex to base64 digest bytes', () => {
    const hex = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    expect(b64decode(hexToB64(hex)).length).toBe(32)
    expect(hexToB64(hex)).toBe('ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=')
  })
})
