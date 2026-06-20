import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAsyncFormulas } from '../src/useAsyncFormulas'
import type { FormulaField } from '../src/analyzeSchema'

const evalSimple = (formula: string, ctx: object) =>
  new Function(...Object.keys(ctx), `return ${formula}`)(...Object.values(ctx))

const ctxOpts = { formulaDataKey: '__formData__', formulaPathKey: '__path__' }

const field = (path: (string | number)[], formula: string): FormulaField => ({
  path,
  formula,
  contextMode: 'siblings',
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useAsyncFormulas — debounce', () => {
  it('returns raw formData initially before debounce fires', async () => {
    vi.useFakeTimers()
    const fields = [field(['total'], 'price * quantity')]
    const { result } = renderHook(() =>
      useAsyncFormulas(
        { price: 2, quantity: 3, total: 0 },
        fields,
        evalSimple,
        300,
        10,
        undefined,
        undefined,
        ctxOpts
      )
    )
    expect((result.current.enrichedFormData as any).total).toBe(0)
  })

  it('enriches formData after debounceMs elapses', async () => {
    vi.useFakeTimers()
    const fields = [field(['total'], 'price * quantity')]
    const { result } = renderHook(() =>
      useAsyncFormulas(
        { price: 2, quantity: 3, total: 0 },
        fields,
        evalSimple,
        300,
        10,
        undefined,
        undefined,
        ctxOpts
      )
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect((result.current.enrichedFormData as any).total).toBe(6)
  })

  it('coalesces rapid handleInput calls into one evaluation', async () => {
    vi.useFakeTimers()
    const evaluator = vi.fn().mockImplementation(evalSimple)
    const fields = [field(['total'], 'price * quantity')]
    const { result } = renderHook(() =>
      useAsyncFormulas(
        { price: 1, quantity: 1, total: 0 },
        fields,
        evaluator,
        300,
        10,
        undefined,
        undefined,
        ctxOpts
      )
    )
    // Wait for initial evaluation
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    evaluator.mockClear()

    // Rapid calls within debounce window
    act(() => {
      result.current.handleInput({ price: 2, quantity: 1, total: 2 })
      result.current.handleInput({ price: 3, quantity: 1, total: 3 })
      result.current.handleInput({ price: 4, quantity: 1, total: 4 })
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })

    expect(evaluator).toHaveBeenCalledTimes(1)
    expect((result.current.enrichedFormData as any).total).toBe(4)
  })

  it('does not evaluate before debounceMs when handleInput resets the timer', async () => {
    vi.useFakeTimers()
    const evaluator = vi.fn().mockImplementation(evalSimple)
    const fields = [field(['total'], 'price * quantity')]
    const { result } = renderHook(() =>
      useAsyncFormulas(
        { price: 1, quantity: 1, total: 0 },
        fields,
        evaluator,
        300,
        10,
        undefined,
        undefined,
        ctxOpts
      )
    )
    // Wait for initial evaluation
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    evaluator.mockClear()

    // Call handleInput, then 200ms later call again — should not evaluate at 300ms
    act(() => { result.current.handleInput({ price: 2, quantity: 1, total: 2 }) })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    act(() => { result.current.handleInput({ price: 3, quantity: 1, total: 3 }) })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })

    // Only 200ms since last handleInput — should not have evaluated yet
    expect(evaluator).toHaveBeenCalledTimes(0)

    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    expect(evaluator).toHaveBeenCalledTimes(1)
  })
})

describe('useAsyncFormulas — onLoadingChange', () => {
  it('calls onLoadingChange with paths when evaluation starts and [] when done', async () => {
    vi.useFakeTimers()
    const onLoadingChange = vi.fn()
    const fields = [field(['total'], 'price * quantity')]
    renderHook(() =>
      useAsyncFormulas(
        { price: 2, quantity: 3, total: 0 },
        fields,
        evalSimple,
        300,
        10,
        undefined,
        onLoadingChange,
        ctxOpts
      )
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })

    expect(onLoadingChange).toHaveBeenNthCalledWith(1, [['total']])
    expect(onLoadingChange).toHaveBeenNthCalledWith(2, [])
  })
})

describe('useAsyncFormulas — error handling', () => {
  it('calls onFormulaError when an async evaluator rejects', async () => {
    vi.useFakeTimers()
    const onFormulaError = vi.fn()
    const failEval = async (formula: string, ctx: object) => {
      if (formula === 'fail') throw new Error('async boom')
      return evalSimple(formula, ctx)
    }
    const fields = [
      field(['bad'], 'fail'),
      field(['good'], 'a + 1'),
    ]
    const { result } = renderHook(() =>
      useAsyncFormulas(
        { a: 1, bad: 0, good: 0 },
        fields,
        failEval,
        300,
        10,
        onFormulaError,
        undefined,
        ctxOpts
      )
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })

    expect(onFormulaError).toHaveBeenCalledWith(['bad'], expect.any(Error))
    expect((result.current.enrichedFormData as any).bad).toBeUndefined()
    expect((result.current.enrichedFormData as any).good).toBe(2)
  })
})

describe('useAsyncFormulas — external formData prop', () => {
  it('re-evaluates when the formData prop changes externally', async () => {
    vi.useFakeTimers()
    const fields = [field(['total'], 'price * quantity')]
    let currentFormData: unknown = { price: 2, quantity: 3, total: 0 }
    const { result, rerender } = renderHook(() =>
      useAsyncFormulas(currentFormData, fields, evalSimple, 300, 10, undefined, undefined, ctxOpts)
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect((result.current.enrichedFormData as any).total).toBe(6)

    currentFormData = { price: 5, quantity: 4, total: 0 }
    rerender()
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect((result.current.enrichedFormData as any).total).toBe(20)
  })
})

describe('useAsyncFormulas — dirty state (in-flight re-evaluation)', () => {
  it('re-evaluates with latest input when handleInput fires during in-flight evaluation', async () => {
    vi.useFakeTimers()

    let resolveFirstEval!: (v: unknown) => void
    let evalCallCount = 0

    const controlledEval = vi.fn().mockImplementation((formula: string, ctx: object) => {
      evalCallCount++
      if (evalCallCount === 1) {
        return new Promise<unknown>(res => { resolveFirstEval = () => res(evalSimple(formula, ctx)) })
      }
      return Promise.resolve(evalSimple(formula, ctx))
    })

    const fields = [field(['total'], 'price * quantity')]
    const { result } = renderHook(() =>
      useAsyncFormulas(
        { price: 2, quantity: 3, total: 6 },
        fields,
        controlledEval,
        300,
        10,
        undefined,
        undefined,
        ctxOpts
      )
    )

    // Let debounce fire to start the first evaluation (which blocks)
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })

    // New input arrives while first evaluation is in-flight
    act(() => { result.current.handleInput({ price: 5, quantity: 4, total: 20 }) })

    // Resolve the first (stale) evaluation
    await act(async () => { resolveFirstEval() })

    // The dirty flag causes an immediate second evaluation with the latest input
    await act(async () => { await Promise.resolve() })

    expect(controlledEval).toHaveBeenCalledTimes(2)
    expect((result.current.enrichedFormData as any).total).toBe(20)
  })
})

describe('useAsyncFormulas — convergence limit', () => {
  it('reports non-converging formulas via onFormulaError after maxConvergencePasses', async () => {
    vi.useFakeTimers()
    const onFormulaError = vi.fn()
    const fields = [field(['x'], 'x + 1')] // always increments, never stabilises
    const { result } = renderHook(() =>
      useAsyncFormulas(
        { x: 0 },
        fields,
        evalSimple,
        300,
        3,
        onFormulaError,
        undefined,
        ctxOpts
      )
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })

    expect(onFormulaError).toHaveBeenCalledWith(['x'], expect.any(Error))
    expect(onFormulaError.mock.calls[0][1].message).toMatch(/did not converge/)
    expect((result.current.enrichedFormData as any).x).toBeUndefined()
  })
})
