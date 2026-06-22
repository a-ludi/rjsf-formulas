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
  condition: true,
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
        ctxOpts,
        () => true,
        'warn'
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
        ctxOpts,
        () => true,
        'warn'
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
        ctxOpts,
        () => true,
        'warn'
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
        ctxOpts,
        () => true,
        'warn'
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
        ctxOpts,
        () => true,
        'warn'
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
        ctxOpts,
        () => true,
        'warn'
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
      useAsyncFormulas(currentFormData, fields, evalSimple, 300, 10, undefined, undefined, ctxOpts, () => true, 'warn')
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

    let resolveFirstEval!: () => void
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
        ctxOpts,
        () => true,
        'warn'
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

  it('does not publish the stale intermediate result when new input arrives during evaluation', async () => {
    vi.useFakeTimers()

    // evalCallCount tracks calls to the evaluator across ALL convergence passes.
    // For initial data { price: 2, quantity: 3, total: 99 }, total starts at 99
    // but price*quantity = 6, so pass 0 produces 6 (not converged), pass 1 repeats → 6 (converged).
    // That means each full enrich() run calls the evaluator TWICE for this data.
    //
    // evalCallCount === 1 → pass 0 of run 1 (block here to simulate slow evaluator)
    // evalCallCount === 3 → pass 0 of run 2 (block here to observe state before run 2 finishes)
    let resolveFirstEval!: () => void
    let resolveSecondRun!: () => void
    let evalCallCount = 0

    const controlledEval = vi.fn().mockImplementation((formula: string, ctx: object) => {
      evalCallCount++
      if (evalCallCount === 1) {
        return new Promise<unknown>(res => { resolveFirstEval = () => res(evalSimple(formula, ctx)) })
      }
      if (evalCallCount === 3) {
        return new Promise<unknown>(res => { resolveSecondRun = () => res(evalSimple(formula, ctx)) })
      }
      return Promise.resolve(evalSimple(formula, ctx))
    })

    const fields = [field(['total'], 'price * quantity')]
    // total: 99 is intentionally wrong so the stale result (6) is visually distinct
    const { result } = renderHook(() =>
      useAsyncFormulas(
        { price: 2, quantity: 3, total: 99 },
        fields,
        controlledEval,
        300,
        10,
        undefined,
        undefined,
        ctxOpts,
        () => true,
        'warn'
      )
    )

    // Debounce fires; run 1 starts. Pass 0 blocks on evalCallCount === 1.
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect((result.current.enrichedFormData as any).total).toBe(99)

    // New input arrives while run 1 is in-flight → fields go dirty
    act(() => { result.current.handleInput({ price: 5, quantity: 4, total: 99 }) })

    // Resolve run 1's blocked pass. This lets pass 1 of run 1 execute (immediate Promise.resolve),
    // converge, then detect dirty and start run 2. Run 2's pass 0 blocks on evalCallCount === 3.
    await act(async () => { resolveFirstEval() })

    // Confirm run 2 has actually started (not just that React hasn't flushed yet)
    expect(controlledEval).toHaveBeenCalledTimes(3)

    // KEY ASSERTION: enrichedFormData must NOT show the stale run-1 result (total: 6).
    // It should retain the value from before the stale run (total: 99).
    expect((result.current.enrichedFormData as any).total).toBe(99)

    // Let run 2 complete — it produces the correct result.
    await act(async () => { resolveSecondRun() })
    await act(async () => { await Promise.resolve() })
    expect((result.current.enrichedFormData as any).total).toBe(20)
  })
})

describe('useAsyncFormulas — unmount during evaluation', () => {
  it('does not call setEnrichedFormData or onLoadingChange after unmount', async () => {
    vi.useFakeTimers()

    let resolveEval!: () => void
    const blockingEval = vi.fn().mockImplementation((formula: string, ctx: object) =>
      new Promise<unknown>(res => { resolveEval = () => res(evalSimple(formula, ctx)) })
    )
    const onLoadingChange = vi.fn()
    const fields = [field(['total'], 'price * quantity')]

    const { unmount } = renderHook(() =>
      useAsyncFormulas(
        { price: 2, quantity: 3, total: 6 },
        fields,
        blockingEval,
        300,
        10,
        undefined,
        onLoadingChange,
        ctxOpts,
        () => true,
        'warn'
      )
    )

    // Debounce fires, evaluation starts (blocked)
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(onLoadingChange).toHaveBeenCalledWith([['total']])
    onLoadingChange.mockClear()

    // Unmount while evaluation is in-flight
    unmount()

    // Resolve the blocked evaluator
    await act(async () => { resolveEval() })

    // onLoadingChange([]) must not be called after unmount
    expect(onLoadingChange).not.toHaveBeenCalled()
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
        ctxOpts,
        () => true,
        'warn'
      )
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })

    expect(onFormulaError).toHaveBeenCalledWith(['x'], expect.any(Error))
    expect(onFormulaError.mock.calls[0][1].message).toMatch(/did not converge/)
    expect((result.current.enrichedFormData as any).x).toBeUndefined()
  })
})
