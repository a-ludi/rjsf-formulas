import { describe, it, expect, vi } from 'vitest'
import { analyzeSchema, ARRAY_INDEX } from '../src/analyzeSchema'
import * as fixtures from './fixtures/schemas'

describe('analyzeSchema — flat objects', () => {
  it('returns one FormulaField for a single computed field', () => {
    const result = analyzeSchema(fixtures.flatWithOneFormula as any)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      path: ['total'],
      formula: 'price * quantity',
      contextMode: 'siblings',
    })
  })

  it('returns multiple FormulaFields', () => {
    const result = analyzeSchema(fixtures.flatWithMultipleFormulas as any)
    expect(result).toHaveLength(2)
    expect(result.map(f => f.path)).toEqual([['sum'], ['product']])
  })

  it('returns empty array when no computed fields', () => {
    expect(analyzeSchema(fixtures.noFormulas as any)).toEqual([])
  })
})

describe('analyzeSchema — nested objects', () => {
  it('recurses into nested objects', () => {
    const result = analyzeSchema(fixtures.nestedObject as any)
    expect(result).toHaveLength(1)
    expect(result[0].path).toEqual(['order', 'total'])
    expect(result[0].formula).toBe('price * quantity')
  })
})

describe('analyzeSchema — array items', () => {
  it('uses ARRAY_INDEX sentinel for uniform array items', () => {
    const result = analyzeSchema(fixtures.arrayWithItems as any)
    expect(result).toHaveLength(1)
    expect(result[0].path).toEqual(['items', ARRAY_INDEX, 'total'])
  })
})
