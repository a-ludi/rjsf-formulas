import { describe, it, expect, vi } from 'vitest'
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

const alwaysActive = (_cond: object, _data: unknown) => true

describe('enrich', () => {
  it('evaluates a single formula and returns enriched formData', async () => {
    const fields: FormulaField[] = [
      { path: ['total'], formula: 'price * quantity', contextMode: 'siblings', condition: true },
    ]
    const result = await enrich({ price: 10, quantity: 3, total: 0 }, fields, evalSimple, 10, undefined, '__formData__', '__path__', alwaysActive, 'warn')
    expect(result).toEqual({ price: 10, quantity: 3, total: 30 })
  })

  it('returns formData unchanged when no formula fields', async () => {
    const data = { a: 1 }
    expect(await enrich(data, [], evalSimple, 10, undefined, '__formData__', '__path__', alwaysActive, 'warn')).toBe(data)
  })

  it('evaluates formulas for each array element independently', async () => {
    const fields: FormulaField[] = [
      { path: ['items', ARRAY_INDEX, 'total'], formula: 'price * quantity', contextMode: 'siblings', condition: true },
    ]
    const data = {
      items: [
        { price: 10, quantity: 2, total: 0 },
        { price: 5, quantity: 4, total: 0 },
      ],
    }
    const result = await enrich(data, fields, evalSimple, 10, undefined, '__formData__', '__path__', alwaysActive, 'warn') as typeof data
    expect(result.items[0].total).toBe(20)
    expect(result.items[1].total).toBe(20)
  })

  it('converges when a computed field references another computed field', async () => {
    const fields: FormulaField[] = [
      { path: ['double'], formula: 'base * 2', contextMode: 'siblings', condition: true },
      { path: ['quad'], formula: 'double * 2', contextMode: 'siblings', condition: true },
    ]
    const result = await enrich({ base: 5, double: 0, quad: 0 }, fields, evalSimple, 10, undefined, '__formData__', '__path__', alwaysActive, 'warn') as any
    expect(result.double).toBe(10)
    expect(result.quad).toBe(20)
  })

  it('calls onFormulaError and sets field to undefined when evaluator throws', async () => {
    const fields: FormulaField[] = [
      { path: ['bad'], formula: 'throw new Error("boom")', contextMode: 'siblings', condition: true },
      { path: ['good'], formula: 'a + 1', contextMode: 'siblings', condition: true },
    ]
    const errors: Array<{ path: (string | number)[]; error: Error }> = []
    const result = await enrich(
      { a: 1, bad: 0, good: 0 },
      fields,
      evalSimple,
      10,
      (path, error) => errors.push({ path, error }),
      '__formData__',
      '__path__',
      alwaysActive,
      'warn'
    ) as any
    expect(result.bad).toBeUndefined()
    expect(result.good).toBe(2)
    expect(errors).toHaveLength(1)
    expect(errors[0].path).toEqual(['bad'])
  })

  it('calls onFormulaError and sets field to undefined on convergence failure', async () => {
    const fields: FormulaField[] = [
      { path: ['x'], formula: 'x + 1', contextMode: 'siblings', condition: true },
    ]
    const errors: Array<{ path: (string | number)[]; error: Error }> = []
    const result = await enrich(
      { x: 0 },
      fields,
      evalSimple,
      3,
      (path, error) => errors.push({ path, error }),
      '__formData__',
      '__path__',
      alwaysActive,
      'warn'
    ) as any
    expect(result.x).toBeUndefined()
    expect(errors).toHaveLength(1)
    expect(errors[0].error.message).toMatch(/did not converge/)
  })

  it('resolves an async evaluator correctly', async () => {
    const asyncEval = async (formula: string, ctx: object) => evalSimple(formula, ctx)
    const fields: FormulaField[] = [
      { path: ['total'], formula: 'price * quantity', contextMode: 'siblings', condition: true },
    ]
    const result = await enrich({ price: 4, quantity: 5, total: 0 }, fields, asyncEval, 10, undefined, '__formData__', '__path__', alwaysActive, 'warn')
    expect(result).toEqual({ price: 4, quantity: 5, total: 20 })
  })

  it('evaluates all formulas in a pass in parallel', async () => {
    const called: string[] = []
    const resolvers: Array<(v: number) => void> = []
    const delayedEval = (formula: string) => {
      called.push(formula)
      return new Promise<number>(res => resolvers.push(res))
    }
    const fields: FormulaField[] = [
      { path: ['x'], formula: 'formulaA', contextMode: 'siblings', condition: true },
      { path: ['y'], formula: 'formulaB', contextMode: 'siblings', condition: true },
    ]
    const enrichPromise = enrich({ x: 1, y: 2 }, fields, delayedEval, 10, undefined, '__formData__', '__path__', alwaysActive, 'warn')
    expect(called).toEqual(['formulaA', 'formulaB'])
    resolvers.forEach((res, i) => res(i + 1))
    await enrichPromise
  })

  it('calls onFormulaError and sets field to undefined when an async evaluator rejects', async () => {
    const asyncFailEval = async (formula: string, ctx: object) => {
      if (formula === 'fail') throw new Error('async boom')
      return evalSimple(formula, ctx)
    }
    const fields: FormulaField[] = [
      { path: ['bad'], formula: 'fail', contextMode: 'siblings', condition: true },
      { path: ['good'], formula: 'a + 1', contextMode: 'siblings', condition: true },
    ]
    const errors: Array<{ path: (string | number)[]; error: Error }> = []
    const result = await enrich(
      { a: 1, bad: 0, good: 0 },
      fields,
      asyncFailEval,
      10,
      (path, error) => errors.push({ path, error }),
      '__formData__',
      '__path__',
      alwaysActive,
      'warn'
    ) as any
    expect(result.bad).toBeUndefined()
    expect(result.good).toBe(2)
    expect(errors).toHaveLength(1)
    expect(errors[0].path).toEqual(['bad'])
  })

  it('converges across multiple passes with an async evaluator', async () => {
    const asyncEval = async (formula: string, ctx: object) => evalSimple(formula, ctx)
    const fields: FormulaField[] = [
      { path: ['double'], formula: 'base * 2', contextMode: 'siblings', condition: true },
      { path: ['quad'], formula: 'double * 2', contextMode: 'siblings', condition: true },
    ]
    const result = await enrich({ base: 5, double: 0, quad: 0 }, fields, asyncEval, 10, undefined, '__formData__', '__path__', alwaysActive, 'warn') as any
    expect(result.double).toBe(10)
    expect(result.quad).toBe(20)
  })
})

describe('enrich — condition filtering', () => {
  it('evaluates field with condition: true (backward compat)', async () => {
    const checkConditionShouldNotBeCalled = (_cond: object, _data: unknown): boolean => {
      throw new Error('checkCondition should not be called for condition: true fields')
    }
    const fields: FormulaField[] = [
      { path: ['total'], formula: 'price * quantity', contextMode: 'siblings', condition: true },
    ]
    const result = await enrich(
      { price: 2, quantity: 5, total: 0 },
      fields,
      evalSimple,
      10,
      undefined,
      '__formData__',
      '__path__',
      checkConditionShouldNotBeCalled,
      'warn'
    ) as any
    expect(result.total).toBe(10)
  })

  it('skips field when checkCondition returns false', async () => {
    const fields: FormulaField[] = [
      { path: ['computed'], formula: '42', contextMode: 'siblings', condition: { type: 'object' } },
    ]
    const result = await enrich(
      { computed: 0 },
      fields,
      evalSimple,
      10,
      undefined,
      '__formData__',
      '__path__',
      () => false,
      'warn'
    ) as any
    // Field is skipped — value stays unchanged
    expect(result.computed).toBe(0)
  })

  it('evaluates field when checkCondition returns true', async () => {
    const fields: FormulaField[] = [
      { path: ['computed'], formula: '42', contextMode: 'siblings', condition: { type: 'object' } },
    ]
    const result = await enrich(
      { computed: 0 },
      fields,
      evalSimple,
      10,
      undefined,
      '__formData__',
      '__path__',
      () => true,
      'warn'
    ) as any
    expect(result.computed).toBe(42)
  })
})

describe('enrich — runtime conflict handling', () => {
  it('ignore mode silently takes last when two active fields share same path', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const evalCalled: string[] = []
    const trackingEval = (formula: string, _ctx: object) => {
      evalCalled.push(formula)
      return evalSimple(formula, _ctx)
    }
    const fields: FormulaField[] = [
      { path: ['val'], formula: '1', contextMode: 'siblings', condition: true },
      { path: ['val'], formula: '2', contextMode: 'siblings', condition: true },
    ]
    const result = await enrich(
      { val: 0 },
      fields,
      trackingEval,
      10,
      undefined,
      '__formData__',
      '__path__',
      alwaysActive,
      'ignore'
    ) as any
    expect(warnSpy).not.toHaveBeenCalled()
    // Last formula wins
    expect(result.val).toBe(2)
    // Only the last formula was evaluated (first was deduplicated away), never the first
    expect(evalCalled).not.toContain('1')
    warnSpy.mockRestore()
  })

  it('warn mode emits console.warn and takes last', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fields: FormulaField[] = [
      { path: ['val'], formula: '1', contextMode: 'siblings', condition: true },
      { path: ['val'], formula: '2', contextMode: 'siblings', condition: true },
    ]
    const result = await enrich(
      { val: 0 },
      fields,
      evalSimple,
      10,
      undefined,
      '__formData__',
      '__path__',
      alwaysActive,
      'warn'
    ) as any
    expect(warnSpy).toHaveBeenCalledOnce()
    expect(warnSpy.mock.calls[0][0]).toMatch(/conflict/)
    expect(result.val).toBe(2)
    warnSpy.mockRestore()
  })

  it('error mode throws synchronously before any evaluation', async () => {
    const evalCalled: string[] = []
    const trackingEval = (formula: string, _ctx: object) => {
      evalCalled.push(formula)
      return evalSimple(formula, _ctx)
    }
    const fields: FormulaField[] = [
      { path: ['val'], formula: '1', contextMode: 'siblings', condition: true },
      { path: ['val'], formula: '2', contextMode: 'siblings', condition: true },
    ]
    await expect(
      enrich(
        { val: 0 },
        fields,
        trackingEval,
        10,
        undefined,
        '__formData__',
        '__path__',
        alwaysActive,
        'error'
      )
    ).rejects.toThrow(TypeError)
    expect(evalCalled).toEqual([])
  })
})
