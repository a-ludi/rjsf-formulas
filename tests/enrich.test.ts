import { describe, it, expect } from 'vitest'
import { getAt, setAt, expandPaths, ARRAY_INDEX } from '../src/enrich'

describe('getAt', () => {
  it('retrieves a nested value', () => {
    expect(getAt({ a: { b: 42 } }, ['a', 'b'])).toBe(42)
  })

  it('retrieves an array element', () => {
    expect(getAt({ items: [{ x: 1 }] }, ['items', 0, 'x'])).toBe(1)
  })

  it('returns undefined for missing paths', () => {
    expect(getAt({ a: 1 }, ['b', 'c'])).toBeUndefined()
  })

  it('returns the root when path is empty', () => {
    const data = { a: 1 }
    expect(getAt(data, [])).toBe(data)
  })
})

describe('setAt', () => {
  it('sets a nested value', () => {
    const data = { a: { b: 1 } }
    setAt(data, ['a', 'b'], 99)
    expect(data.a.b).toBe(99)
  })

  it('sets an array element', () => {
    const data = { items: [{ x: 1 }] }
    setAt(data, ['items', 0, 'x'], 42)
    expect(data.items[0].x).toBe(42)
  })
})

describe('expandPaths', () => {
  it('returns path unchanged when no ARRAY_INDEX', () => {
    const paths = expandPaths(['a', 'b'], { a: { b: 1 } })
    expect(paths).toEqual([['a', 'b']])
  })

  it('expands ARRAY_INDEX to concrete indices', () => {
    const data = { items: [{ total: 0 }, { total: 0 }] }
    const paths = expandPaths(['items', ARRAY_INDEX, 'total'], data)
    expect(paths).toEqual([['items', 0, 'total'], ['items', 1, 'total']])
  })

  it('returns empty array when the target array is empty', () => {
    const paths = expandPaths(['items', ARRAY_INDEX, 'total'], { items: [] })
    expect(paths).toEqual([])
  })

  it('expands nested ARRAY_INDEX', () => {
    const data = { matrix: [[{ v: 0 }], [{ v: 0 }, { v: 0 }]] }
    const paths = expandPaths(['matrix', ARRAY_INDEX, ARRAY_INDEX, 'v'], data)
    expect(paths).toEqual([
      ['matrix', 0, 0, 'v'],
      ['matrix', 1, 0, 'v'],
      ['matrix', 1, 1, 'v'],
    ])
  })
})

import { enrich } from '../src/enrich'
import type { FormulaField } from '../src/analyzeSchema'

const evalSimple = (formula: string, ctx: object) =>
  // Safe for tests only: evaluates formula string with context as local variables
  new Function(...Object.keys(ctx), `return ${formula}`)(...Object.values(ctx))

describe('enrich', () => {
  it('evaluates a single formula and returns enriched formData', () => {
    const fields: FormulaField[] = [
      { path: ['total'], formula: 'price * quantity', contextMode: 'siblings' },
    ]
    const result = enrich({ price: 10, quantity: 3, total: 0 }, fields, evalSimple, 10, undefined)
    expect(result).toEqual({ price: 10, quantity: 3, total: 30 })
  })

  it('returns formData unchanged when no formula fields', () => {
    const data = { a: 1 }
    expect(enrich(data, [], evalSimple, 10, undefined)).toBe(data)
  })

  it('evaluates formulas for each array element independently', () => {
    const fields: FormulaField[] = [
      { path: ['items', ARRAY_INDEX, 'total'], formula: 'price * quantity', contextMode: 'siblings' },
    ]
    const data = {
      items: [
        { price: 10, quantity: 2, total: 0 },
        { price: 5, quantity: 4, total: 0 },
      ],
    }
    const result = enrich(data, fields, evalSimple, 10, undefined) as typeof data
    expect(result.items[0].total).toBe(20)
    expect(result.items[1].total).toBe(20)
  })

  it('converges when a computed field references another computed field', () => {
    const fields: FormulaField[] = [
      { path: ['double'], formula: 'base * 2', contextMode: 'siblings' },
      { path: ['quad'], formula: 'double * 2', contextMode: 'siblings' },
    ]
    const result = enrich({ base: 5, double: 0, quad: 0 }, fields, evalSimple, 10, undefined) as any
    expect(result.double).toBe(10)
    expect(result.quad).toBe(20)
  })

  it('calls onFormulaError and sets field to undefined when evaluator throws', () => {
    const fields: FormulaField[] = [
      { path: ['bad'], formula: 'throw new Error("boom")', contextMode: 'siblings' },
      { path: ['good'], formula: 'a + 1', contextMode: 'siblings' },
    ]
    const errors: Array<{ path: (string | number)[]; error: Error }> = []
    const result = enrich(
      { a: 1, bad: 0, good: 0 },
      fields,
      evalSimple,
      10,
      (path, error) => errors.push({ path, error })
    ) as any
    expect(result.bad).toBeUndefined()
    expect(result.good).toBe(2)
    expect(errors).toHaveLength(1)
    expect(errors[0].path).toEqual(['bad'])
  })

  it('calls onFormulaError and sets field to undefined on convergence failure', () => {
    const fields: FormulaField[] = [
      { path: ['x'], formula: 'x + 1', contextMode: 'siblings' }, // never converges
    ]
    const errors: Array<{ path: (string | number)[]; error: Error }> = []
    const result = enrich(
      { x: 0 },
      fields,
      evalSimple,
      3,
      (path, error) => errors.push({ path, error })
    ) as any
    expect(result.x).toBeUndefined()
    expect(errors).toHaveLength(1)
    expect(errors[0].error.message).toMatch(/did not converge/)
  })
})
