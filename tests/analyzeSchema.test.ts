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

describe('analyzeSchema — prefixItems and combined arrays', () => {
  it('uses integer indices for prefixItems tuple slots', () => {
    const result = analyzeSchema(fixtures.arrayWithPrefixItems as any)
    expect(result).toHaveLength(1)
    expect(result[0].path).toEqual(['tuple', 2])
    expect(result[0].formula).toBe('tuple[0] + tuple[1]')
  })

  it('handles both prefixItems and items in the same array', () => {
    const result = analyzeSchema(fixtures.arrayWithBoth as any)
    expect(result).toHaveLength(2)
    expect(result[0].path).toEqual(['mixed', 1])
    expect(result[1].path).toEqual(['mixed', ARRAY_INDEX, 'doubled'])
  })

  it('recurses into nested arrays', () => {
    const result = analyzeSchema(fixtures.nestedArrays as any)
    expect(result).toHaveLength(1)
    expect(result[0].path).toEqual(['matrix', ARRAY_INDEX, ARRAY_INDEX, 'doubled'])
  })
})

describe('analyzeSchema — context modes', () => {
  it('defaults to siblings when x-formula-context is absent', () => {
    const result = analyzeSchema(fixtures.flatWithOneFormula as any)
    expect(result[0].contextMode).toBe('siblings')
  })

  it('accepts explicit "siblings" context mode', () => {
    const schema = {
      type: 'object',
      properties: {
        a: { type: 'number' },
        b: { type: 'number', 'x-formula': 'a', 'x-formula-context': 'siblings' },
      },
    }
    expect(analyzeSchema(schema as any)[0].contextMode).toBe('siblings')
  })

  it('returns extended contextMode', () => {
    const result = analyzeSchema(fixtures.extendedContextSchema as any)
    expect(result[0].contextMode).toBe('extended')
  })

  it('treats unknown context as siblings and warns', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = analyzeSchema(fixtures.unknownContextSchema as any)
    expect(result[0].contextMode).toBe('siblings')
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('invalid-mode'))
    warnSpy.mockRestore()
  })
})

describe('analyzeSchema — composition operators', () => {
  it('skips oneOf branches and emits a warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = analyzeSchema(fixtures.withOneOfSchema as any)
    expect(result).toEqual([])
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('oneOf'))
    warnSpy.mockRestore()
  })
})

describe('analyzeSchema — custom options', () => {
  it('uses a custom formulaKey', () => {
    const schema = {
      type: 'object',
      properties: {
        total: { type: 'number', 'x-calc': 'a + b' },
      },
    }
    const result = analyzeSchema(schema as any, { formulaKey: 'x-calc' })
    expect(result).toHaveLength(1)
    expect(result[0].formula).toBe('a + b')
  })

  it('uses a custom formulaContextKey', () => {
    const schema = {
      type: 'object',
      properties: {
        total: {
          type: 'number',
          'x-formula': 'a + b',
          'x-ctx': 'extended',
        },
      },
    }
    const result = analyzeSchema(schema as any, { formulaContextKey: 'x-ctx' })
    expect(result[0].contextMode).toBe('extended')
  })
})

describe('analyzeSchema — non-string formula guard', () => {
  it('skips fields with non-string formula values and warns', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const schema = {
      type: 'object',
      properties: {
        a: { type: 'number' },
        bad: { type: 'number', 'x-formula': 42 },
      },
    }
    const result = analyzeSchema(schema as any)
    expect(result).toEqual([])
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not a string'))
    warnSpy.mockRestore()
  })
})
