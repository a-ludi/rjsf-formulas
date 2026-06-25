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
      condition: true,
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

  it('detects formulas in uniform array items when type is omitted', () => {
    const result = analyzeSchema(fixtures.arrayWithItemsNoType as any)
    expect(result).toHaveLength(1)
    expect(result[0].path).toEqual(['items', ARRAY_INDEX, 'total'])
  })
})

describe('analyzeSchema — arrays without explicit type', () => {
  it('detects formulas in prefixItems tuple slots when type is omitted', () => {
    const result = analyzeSchema(fixtures.arrayWithPrefixItemsNoType as any)
    expect(result).toHaveLength(1)
    expect(result[0].path).toEqual(['tuple', 1])
    expect(result[0].formula).toBe('a + 1')
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
  it('recurses into oneOf branches (no formulas → empty result, no warning)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = analyzeSchema(fixtures.withOneOfSchema as any)
    expect(result).toEqual([])
    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

describe('analyzeSchema — oneOf / anyOf branches', () => {
  it('collects fields from all branches of a oneOf', () => {
    const schema = {
      type: 'object',
      oneOf: [
        { properties: { a: { type: 'number', 'x-formula': 'b + 1' } } },
        { properties: { b: { type: 'number', 'x-formula': 'a + 1' } } },
      ],
    }
    const result = analyzeSchema(schema as any)
    expect(result).toHaveLength(2)
    expect(result.map(f => f.path)).toEqual([['a'], ['b']])
  })

  it('sets condition to the branch schema for each field in a oneOf', () => {
    const branch0 = { properties: { a: { type: 'number', 'x-formula': 'b + 1' } } }
    const branch1 = { properties: { b: { type: 'number', 'x-formula': 'a + 1' } } }
    const schema = { type: 'object', oneOf: [branch0, branch1] }
    const result = analyzeSchema(schema as any)
    expect(result[0].condition).toBe(branch0)
    expect(result[1].condition).toBe(branch1)
  })

  it('collects from anyOf (same logic as oneOf)', () => {
    const branch0 = { properties: { x: { type: 'number', 'x-formula': 'y * 2' } } }
    const branch1 = { properties: { y: { type: 'number', 'x-formula': 'x / 2' } } }
    const schema = { type: 'object', anyOf: [branch0, branch1] }
    const result = analyzeSchema(schema as any)
    expect(result).toHaveLength(2)
    expect(result[0].condition).toBe(branch0)
    expect(result[1].condition).toBe(branch1)
  })

  it('no conflict detection at analysis time — both branches collected even if same path', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const schema = {
      type: 'object',
      oneOf: [
        { properties: { total: { type: 'number', 'x-formula': 'a + b' } } },
        { properties: { total: { type: 'number', 'x-formula': 'a * b' } } },
      ],
    }
    const result = analyzeSchema(schema as any)
    expect(result).toHaveLength(2)
    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

describe('analyzeSchema — nested condition composition', () => {
  it('field inside oneOf[0] gets condition: branchSchema (not true)', () => {
    const branch = { properties: { a: { type: 'number', 'x-formula': 'b + 1' } } }
    const schema = { type: 'object', oneOf: [branch] }
    const result = analyzeSchema(schema as any)
    expect(result[0].condition).toBe(branch)
    expect(result[0].condition).not.toBe(true)
  })

  it('field inside allOf inside oneOf[0] gets condition: branchSchema (allOf does not add to condition)', () => {
    const outerBranch = {
      allOf: [
        { properties: { a: { type: 'number', 'x-formula': 'b + 1' } } },
      ],
    }
    const schema = { type: 'object', oneOf: [outerBranch] }
    const result = analyzeSchema(schema as any)
    expect(result).toHaveLength(1)
    expect(result[0].condition).toBe(outerBranch)
  })

  it('field inside oneOf[1] inside oneOf[0] gets condition: { allOf: [outer, inner] }', () => {
    const innerBranch = { properties: { a: { type: 'number', 'x-formula': 'b + 1' } } }
    const outerBranch = {
      properties: { x: { type: 'number' } },
      oneOf: [innerBranch],
    }
    const schema = { type: 'object', oneOf: [outerBranch] }
    const result = analyzeSchema(schema as any)
    expect(result).toHaveLength(1)
    expect(result[0].condition).toEqual({ allOf: [outerBranch, innerBranch] })
  })

  it('triple nesting composes allOf correctly', () => {
    const innerBranch = { properties: { a: { type: 'number', 'x-formula': 'b' } } }
    const midBranch = { oneOf: [innerBranch] }
    const outerBranch = { oneOf: [midBranch] }
    const schema = { oneOf: [outerBranch] }
    const result = analyzeSchema(schema as any)
    expect(result).toHaveLength(1)
    // outer -> mid composes to { allOf: [outerBranch, midBranch] }
    // then -> inner composes to { allOf: [outerBranch, midBranch, innerBranch] }
    expect(result[0].condition).toEqual({ allOf: [outerBranch, midBranch, innerBranch] })
  })
})

describe('analyzeSchema — $ref', () => {
  it('resolves $ref and collects formula from referenced definition', () => {
    const schema = {
      type: 'object',
      definitions: {
        ComputedField: {
          type: 'number',
          'x-formula': 'a + b',
        },
      },
      properties: {
        a: { type: 'number' },
        b: { type: 'number' },
        total: { $ref: '#/definitions/ComputedField' },
      },
    }
    const result = analyzeSchema(schema as any)
    expect(result).toHaveLength(1)
    expect(result[0].path).toEqual(['total'])
    expect(result[0].formula).toBe('a + b')
    expect(result[0].condition).toBe(true)
  })

  it('$ref inside a oneOf branch inherits the branch condition', () => {
    const branch = {
      properties: {
        total: { $ref: '#/definitions/ComputedField' },
      },
    }
    const schema = {
      type: 'object',
      definitions: {
        ComputedField: {
          type: 'number',
          'x-formula': 'a + b',
        },
      },
      oneOf: [branch],
    }
    const result = analyzeSchema(schema as any)
    expect(result).toHaveLength(1)
    expect(result[0].path).toEqual(['total'])
    expect(result[0].formula).toBe('a + b')
    expect(result[0].condition).toBe(branch)
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

describe('analyzeSchema — allOf branches', () => {
  it('recurses into allOf branches and collects formula fields', () => {
    const schema = {
      type: 'object',
      allOf: [
        {
          properties: {
            a: { type: 'number' },
            b: { type: 'number', 'x-formula': 'a * 2' },
          },
        },
        {
          properties: {
            c: { type: 'number', 'x-formula': 'a + b' },
          },
        },
      ],
    }
    const result = analyzeSchema(schema as any)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      path: ['b'],
      formula: 'a * 2',
      contextMode: 'siblings',
      condition: true,
    })
    expect(result[1]).toEqual({
      path: ['c'],
      formula: 'a + b',
      contextMode: 'siblings',
      condition: true,
    })
  })

  it('collects fields from both properties and allOf branches', () => {
    const schema = {
      type: 'object',
      properties: {
        a: { type: 'number' },
        b: { type: 'number', 'x-formula': 'a + 1' },
      },
      allOf: [
        {
          properties: {
            c: { type: 'number', 'x-formula': 'a * 2' },
          },
        },
      ],
    }
    const result = analyzeSchema(schema as any)
    expect(result).toHaveLength(2)
    expect(result.map(f => f.path)).toEqual([['b'], ['c']])
  })

  it('does not warn or error when allOf branches have distinct paths', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const schema = {
      allOf: [
        { properties: { x: { type: 'number', 'x-formula': 'a + 1' } } },
        { properties: { y: { type: 'number', 'x-formula': 'a + 2' } } },
      ],
    }
    const result = analyzeSchema(schema as any)
    expect(result).toHaveLength(2)
    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('collects formulas from allOf nested under a properties path', () => {
    const schema = {
      type: 'object',
      properties: {
        address: {
          type: 'object',
          allOf: [
            { properties: { zipCode: { type: 'string', 'x-formula': 'city + "-" + state' } } },
          ],
        },
      },
    }
    const result = analyzeSchema(schema as any)
    expect(result).toHaveLength(1)
    expect(result[0].path).toEqual(['address', 'zipCode'])
    expect(result[0].condition).toBe(true)
  })

  it('all FormulaFields from allOf have condition: true', () => {
    const schema = {
      allOf: [
        { properties: { total: { type: 'number', 'x-formula': 'a + b' } } },
      ],
    }
    const result = analyzeSchema(schema as any)
    expect(result[0].condition).toBe(true)
  })
})

describe('analyzeSchema — if/then/else', () => {
  it('collects formulas from then branch with ifSchema as condition', () => {
    const ifSchema = { properties: { type: { const: 'A' } } }
    const schema = {
      type: 'object',
      if: ifSchema,
      then: { properties: { total: { type: 'number', 'x-formula': 'a + b' } } },
    }
    const result = analyzeSchema(schema as any)
    expect(result).toHaveLength(1)
    expect(result[0].path).toEqual(['total'])
    expect(result[0].formula).toBe('a + b')
    expect(result[0].condition).toEqual(ifSchema)
  })

  it('collects formulas from else branch with { not: ifSchema } as condition', () => {
    const ifSchema = { properties: { type: { const: 'A' } } }
    const schema = {
      type: 'object',
      if: ifSchema,
      else: { properties: { fallback: { type: 'number', 'x-formula': 'x * 2' } } },
    }
    const result = analyzeSchema(schema as any)
    expect(result).toHaveLength(1)
    expect(result[0].path).toEqual(['fallback'])
    expect(result[0].condition).toEqual({ not: ifSchema })
  })

  it('collects from both then and else when both have formulas', () => {
    const ifSchema = { properties: { type: { const: 'A' } } }
    const schema = {
      type: 'object',
      if: ifSchema,
      then: { properties: { total: { type: 'number', 'x-formula': 'a + b' } } },
      else: { properties: { total: { type: 'number', 'x-formula': 'a * b' } } },
    }
    const result = analyzeSchema(schema as any)
    expect(result).toHaveLength(2)
    expect(result[0].condition).toEqual(ifSchema)
    expect(result[1].condition).toEqual({ not: ifSchema })
  })

  it('warns when formula key is found in if schema and does not collect it', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const schema = {
      type: 'object',
      if: { 'x-formula': 'should not be here' },
      then: { properties: { total: { type: 'number', 'x-formula': 'a + b' } } },
    }
    const result = analyzeSchema(schema as any)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('if'))
    // Only the then formula is collected, not anything from the if schema
    expect(result).toHaveLength(1)
    expect(result[0].path).toEqual(['total'])
    warnSpy.mockRestore()
  })

  it('if/then condition composes with ambient condition from enclosing oneOf', () => {
    const ifSchema = { properties: { type: { const: 'A' } } }
    const outerBranch = {
      properties: { type: { type: 'string' } },
      if: ifSchema,
      then: { properties: { total: { type: 'number', 'x-formula': 'a + b' } } },
    }
    const schema = { type: 'object', oneOf: [outerBranch] }
    const result = analyzeSchema(schema as any)
    expect(result).toHaveLength(1)
    expect(result[0].condition).toEqual({ allOf: [outerBranch, ifSchema] })
  })
})

describe('analyzeSchema — allOf conflict detection', () => {
  it('warns and takes last on path collision with default behavior (warn)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const schema = {
      allOf: [
        { properties: { total: { type: 'number', 'x-formula': 'a + b' } } },
        { properties: { total: { type: 'number', 'x-formula': 'a * b' } } },
      ],
    }
    const result = analyzeSchema(schema as any)
    expect(result).toHaveLength(1)
    expect(result[0].formula).toBe('a * b')
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('conflict'))
    warnSpy.mockRestore()
  })

  it('silently takes last on path collision with formulaConflictBehavior: "ignore"', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const schema = {
      allOf: [
        { properties: { total: { type: 'number', 'x-formula': 'a + b' } } },
        { properties: { total: { type: 'number', 'x-formula': 'a * b' } } },
      ],
    }
    const result = analyzeSchema(schema as any, { formulaConflictBehavior: 'ignore' })
    expect(result).toHaveLength(1)
    expect(result[0].formula).toBe('a * b')
    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('throws synchronously on path collision with formulaConflictBehavior: "error"', () => {
    const schema = {
      allOf: [
        { properties: { total: { type: 'number', 'x-formula': 'a + b' } } },
        { properties: { total: { type: 'number', 'x-formula': 'a * b' } } },
      ],
    }
    expect(() => analyzeSchema(schema as any, { formulaConflictBehavior: 'error' })).toThrow(TypeError)
  })

  it('error message includes both conflicting formulas', () => {
    const schema = {
      allOf: [
        { properties: { total: { type: 'number', 'x-formula': 'a + b' } } },
        { properties: { total: { type: 'number', 'x-formula': 'a * b' } } },
      ],
    }
    expect(() => analyzeSchema(schema as any, { formulaConflictBehavior: 'error' }))
      .toThrow(expect.objectContaining({ message: expect.stringContaining('a + b') }))
  })
})

describe('analyzeSchema — legacy tuple items (items as array)', () => {
  it('discovers formulas in draft-07 tuple form (items as array)', () => {
    const result = analyzeSchema(fixtures.legacyTupleItems as any)
    expect(result).toHaveLength(1)
    expect(result[0].path).toEqual(['list', 0, 'sum'])
    expect(result[0].formula).toBe('a + b')
    expect(result[0].condition).toBe(true)
  })
})
