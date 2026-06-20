# Async Formula Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Widen `evaluator` to accept async functions, add debounced evaluation with a per-field state machine, expose loading state, and preserve full backward compatibility with sync evaluators.

**Architecture:** `enrich` becomes async and evaluates all formulas in a single pass in parallel via `Promise.allSettled`. A new `useAsyncFormulas` hook owns the debounce timer, per-field state machine, and loading callbacks. `FormulaForm` drops its `useMemo`-based synchronous enrichment and delegates entirely to the hook.

**Tech Stack:** TypeScript, React (hooks), Vitest, `@testing-library/react` (`renderHook`, `act`), `vi.useFakeTimers` / `vi.advanceTimersByTimeAsync`.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/enrich.ts` | Widen evaluator type; make `applyAllFormulas` async with `Promise.allSettled`; make `enrich` async |
| Create | `src/useAsyncFormulas.ts` | Debounce timer, per-field state machine, loading callbacks, convergence loop |
| Modify | `src/FormulaForm.tsx` | Use `useAsyncFormulas`; add `debounceMs` and `onLoadingChange` props; remove sync enrichment |
| Modify | `tests/enrich.test.ts` | Add `async`/`await` to all `enrich` tests; add async evaluator tests |
| Create | `tests/useAsyncFormulas.test.tsx` | Unit tests for the hook (jsdom environment via `.tsx` extension) |
| Modify | `tests/FormulaForm.test.tsx` | Update mount + onChange tests for async semantics; add debounceMs/onLoadingChange tests |

---

## Task 1: Make `enrich` async with parallel evaluation

**Files:**
- Modify: `src/enrich.ts`
- Modify: `tests/enrich.test.ts`

- [ ] **Step 1: Add failing async evaluator tests to `tests/enrich.test.ts`**

Append these tests inside the existing `describe('enrich', ...)` block (after line 145, before the closing `}`):

```typescript
  it('resolves an async evaluator correctly', async () => {
    const asyncEval = async (formula: string, ctx: object) => evalSimple(formula, ctx)
    const fields: FormulaField[] = [
      { path: ['total'], formula: 'price * quantity', contextMode: 'siblings' },
    ]
    const result = await enrich({ price: 4, quantity: 5, total: 0 }, fields, asyncEval, 10, undefined)
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
      { path: ['x'], formula: 'formulaA', contextMode: 'siblings' },
      { path: ['y'], formula: 'formulaB', contextMode: 'siblings' },
    ]
    const enrichPromise = enrich({ x: 0, y: 0 }, fields, delayedEval, 10, undefined)
    // Both evaluators are called before either resolves (parallel, not sequential)
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
      { path: ['bad'], formula: 'fail', contextMode: 'siblings' },
      { path: ['good'], formula: 'a + 1', contextMode: 'siblings' },
    ]
    const errors: Array<{ path: (string | number)[]; error: Error }> = []
    const result = await enrich(
      { a: 1, bad: 0, good: 0 },
      fields,
      asyncFailEval,
      10,
      (path, error) => errors.push({ path, error })
    ) as any
    expect(result.bad).toBeUndefined()
    expect(result.good).toBe(2)
    expect(errors).toHaveLength(1)
    expect(errors[0].path).toEqual(['bad'])
  })
```

- [ ] **Step 2: Run new tests to verify they fail**

```bash
bunx vitest run tests/enrich.test.ts
```

Expected: the 3 new async tests FAIL. The "parallel" test fails because the current sync enrich stores a Promise object as the value instead of its resolved number. The "resolves async" test fails because `total` is a Promise, not 20. The "async rejects" test fails because the Promise rejection is uncaught.

- [ ] **Step 3: Update all existing `enrich` tests to be async**

In `tests/enrich.test.ts`, update every `it(...)` callback inside `describe('enrich', ...)` to be async and `await` the `enrich(...)` call. The block currently runs from line 72 to 145. Replace the entire `describe('enrich', ...)` block (keeping the new tests you just added) with:

```typescript
describe('enrich', () => {
  it('evaluates a single formula and returns enriched formData', async () => {
    const fields: FormulaField[] = [
      { path: ['total'], formula: 'price * quantity', contextMode: 'siblings' },
    ]
    const result = await enrich({ price: 10, quantity: 3, total: 0 }, fields, evalSimple, 10, undefined)
    expect(result).toEqual({ price: 10, quantity: 3, total: 30 })
  })

  it('returns formData unchanged when no formula fields', async () => {
    const data = { a: 1 }
    expect(await enrich(data, [], evalSimple, 10, undefined)).toBe(data)
  })

  it('evaluates formulas for each array element independently', async () => {
    const fields: FormulaField[] = [
      { path: ['items', ARRAY_INDEX, 'total'], formula: 'price * quantity', contextMode: 'siblings' },
    ]
    const data = {
      items: [
        { price: 10, quantity: 2, total: 0 },
        { price: 5, quantity: 4, total: 0 },
      ],
    }
    const result = await enrich(data, fields, evalSimple, 10, undefined) as typeof data
    expect(result.items[0].total).toBe(20)
    expect(result.items[1].total).toBe(20)
  })

  it('converges when a computed field references another computed field', async () => {
    const fields: FormulaField[] = [
      { path: ['double'], formula: 'base * 2', contextMode: 'siblings' },
      { path: ['quad'], formula: 'double * 2', contextMode: 'siblings' },
    ]
    const result = await enrich({ base: 5, double: 0, quad: 0 }, fields, evalSimple, 10, undefined) as any
    expect(result.double).toBe(10)
    expect(result.quad).toBe(20)
  })

  it('calls onFormulaError and sets field to undefined when evaluator throws', async () => {
    const fields: FormulaField[] = [
      { path: ['bad'], formula: 'throw new Error("boom")', contextMode: 'siblings' },
      { path: ['good'], formula: 'a + 1', contextMode: 'siblings' },
    ]
    const errors: Array<{ path: (string | number)[]; error: Error }> = []
    const result = await enrich(
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

  it('calls onFormulaError and sets field to undefined on convergence failure', async () => {
    const fields: FormulaField[] = [
      { path: ['x'], formula: 'x + 1', contextMode: 'siblings' },
    ]
    const errors: Array<{ path: (string | number)[]; error: Error }> = []
    const result = await enrich(
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

  it('resolves an async evaluator correctly', async () => {
    const asyncEval = async (formula: string, ctx: object) => evalSimple(formula, ctx)
    const fields: FormulaField[] = [
      { path: ['total'], formula: 'price * quantity', contextMode: 'siblings' },
    ]
    const result = await enrich({ price: 4, quantity: 5, total: 0 }, fields, asyncEval, 10, undefined)
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
      { path: ['x'], formula: 'formulaA', contextMode: 'siblings' },
      { path: ['y'], formula: 'formulaB', contextMode: 'siblings' },
    ]
    const enrichPromise = enrich({ x: 0, y: 0 }, fields, delayedEval, 10, undefined)
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
      { path: ['bad'], formula: 'fail', contextMode: 'siblings' },
      { path: ['good'], formula: 'a + 1', contextMode: 'siblings' },
    ]
    const errors: Array<{ path: (string | number)[]; error: Error }> = []
    const result = await enrich(
      { a: 1, bad: 0, good: 0 },
      fields,
      asyncFailEval,
      10,
      (path, error) => errors.push({ path, error })
    ) as any
    expect(result.bad).toBeUndefined()
    expect(result.good).toBe(2)
    expect(errors).toHaveLength(1)
    expect(errors[0].path).toEqual(['bad'])
  })

  it('converges across multiple passes with an async evaluator', async () => {
    const asyncEval = async (formula: string, ctx: object) => evalSimple(formula, ctx)
    const fields: FormulaField[] = [
      { path: ['double'], formula: 'base * 2', contextMode: 'siblings' },
      { path: ['quad'], formula: 'double * 2', contextMode: 'siblings' },
    ]
    const result = await enrich({ base: 5, double: 0, quad: 0 }, fields, asyncEval, 10, undefined) as any
    expect(result.double).toBe(10)
    expect(result.quad).toBe(20)
  })
})
```

- [ ] **Step 4: Implement async `enrich` in `src/enrich.ts`**

Replace the entire file with:

```typescript
import equal from 'fast-deep-equal'
import type { FormulaField, ArrayIndex } from './analyzeSchema'
import { ARRAY_INDEX } from './analyzeSchema'
import { buildContext } from './buildContext'
import type { BuildContextOptions } from './buildContext'

export { ARRAY_INDEX }

export function getAt(data: unknown, path: (string | number)[]): unknown {
  return path.reduce<unknown>((curr, key) => {
    if (curr == null || typeof curr !== 'object') return undefined
    return (curr as Record<string | number, unknown>)[key]
  }, data)
}

export function setAt(data: unknown, path: (string | number)[], value: unknown): void {
  if (path.length === 0) return
  const parent = getAt(data, path.slice(0, -1))
  if (parent != null && typeof parent === 'object') {
    ;(parent as Record<string | number, unknown>)[path[path.length - 1]] = value
  }
}

export function expandPaths(
  templatePath: (string | number | ArrayIndex)[],
  data: unknown,
  currentPath: (string | number)[] = []
): (string | number)[][] {
  if (templatePath.length === 0) return [currentPath]
  const [head, ...rest] = templatePath
  if (head === ARRAY_INDEX) {
    const arr = getAt(data, currentPath)
    if (!Array.isArray(arr)) return []
    const results: (string | number)[][] = []
    for (let i = 0; i < arr.length; i++) {
      results.push(...expandPaths(rest, data, [...currentPath, i]))
    }
    return results
  }
  return expandPaths(rest, data, [...currentPath, head as string | number])
}

export function deepEqual(a: unknown, b: unknown): boolean {
  return equal(a, b)
}

type EvalTask = { field: FormulaField; concretePath: (string | number)[]; context: object }

async function applyAllFormulas(
  formData: unknown,
  formulaFields: FormulaField[],
  evaluator: (formula: string, context: object) => unknown | Promise<unknown>,
  onFormulaError: ((path: (string | number)[], error: Error) => void) | undefined,
  contextOptions: BuildContextOptions
): Promise<unknown> {
  const result = structuredClone(formData)

  // Collect all tasks from the snapshot before any evaluation
  const tasks: EvalTask[] = []
  for (const field of formulaFields) {
    for (const concretePath of expandPaths(field.path, result)) {
      const context = buildContext(field, concretePath, result, contextOptions)
      tasks.push({ field, concretePath, context })
    }
  }

  // Evaluate all formulas in parallel
  const settled = await Promise.allSettled(
    tasks.map(({ field, context }) => Promise.resolve(evaluator(field.formula, context)))
  )

  // Apply results
  for (let i = 0; i < tasks.length; i++) {
    const { concretePath } = tasks[i]
    const outcome = settled[i]
    if (outcome.status === 'fulfilled') {
      setAt(result, concretePath, outcome.value)
    } else {
      const err = outcome.reason instanceof Error
        ? outcome.reason
        : new Error(String(outcome.reason))
      onFormulaError?.(concretePath, err)
      setAt(result, concretePath, undefined)
    }
  }

  return result
}

function allConverged(
  prev: unknown,
  next: unknown,
  formulaFields: FormulaField[]
): boolean {
  for (const field of formulaFields) {
    for (const concretePath of expandPaths(field.path, next)) {
      if (!deepEqual(getAt(prev, concretePath), getAt(next, concretePath))) {
        return false
      }
    }
  }
  return true
}

export async function enrich(
  formData: unknown,
  formulaFields: FormulaField[],
  evaluator: (formula: string, context: object) => unknown | Promise<unknown>,
  maxConvergencePasses: number,
  onFormulaError: ((path: (string | number)[], error: Error) => void) | undefined,
  formulaDataKey = '__formData__',
  formulaPathKey = '__path__'
): Promise<unknown> {
  if (formulaFields.length === 0) return formData

  const contextOptions: BuildContextOptions = { formulaDataKey, formulaPathKey }
  let current = formData

  for (let pass = 0; pass < maxConvergencePasses; pass++) {
    const candidate = await applyAllFormulas(current, formulaFields, evaluator, undefined, contextOptions)
    if (allConverged(current, candidate, formulaFields)) {
      return applyAllFormulas(current, formulaFields, evaluator, onFormulaError, contextOptions)
    }
    current = candidate
  }

  // maxConvergencePasses exceeded — identify and report non-converging fields
  const candidate = await applyAllFormulas(current, formulaFields, evaluator, undefined, contextOptions)
  const result = structuredClone(candidate)

  for (const field of formulaFields) {
    for (const concretePath of expandPaths(field.path, candidate)) {
      if (!deepEqual(getAt(current, concretePath), getAt(candidate, concretePath))) {
        onFormulaError?.(
          concretePath,
          new Error(
            `[rjsf-formulas] Formula at [${concretePath.join(', ')}] did not converge after ${maxConvergencePasses} passes`
          )
        )
        setAt(result, concretePath, undefined)
      }
    }
  }

  return result
}
```

- [ ] **Step 5: Run all enrich tests to verify they pass**

```bash
bunx vitest run tests/enrich.test.ts
```

Expected: all tests PASS across both `rjsf-v6` and `rjsf-v5` projects (9 tests × 2 = 18 passes).

- [ ] **Step 6: Commit**

```bash
git add src/enrich.ts tests/enrich.test.ts
git commit -m "feat: make enrich async with parallel Promise.allSettled evaluation"
```

---

## Task 2: Implement `useAsyncFormulas` hook

**Files:**
- Create: `src/useAsyncFormulas.ts`
- Create: `tests/useAsyncFormulas.test.tsx`

- [ ] **Step 1: Create `tests/useAsyncFormulas.test.tsx` with failing tests**

Create the file with this content:

```typescript
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
      result.current.handleInput({ price: 2, quantity: 1, total: 0 })
      result.current.handleInput({ price: 3, quantity: 1, total: 0 })
      result.current.handleInput({ price: 4, quantity: 1, total: 0 })
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
    act(() => { result.current.handleInput({ price: 2, quantity: 1, total: 0 }) })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    act(() => { result.current.handleInput({ price: 3, quantity: 1, total: 0 }) })
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
        { price: 2, quantity: 3, total: 0 },
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
    act(() => { result.current.handleInput({ price: 5, quantity: 4, total: 0 }) })

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
```

- [ ] **Step 2: Run to verify tests fail**

```bash
bunx vitest run tests/useAsyncFormulas.test.tsx
```

Expected: all tests FAIL with "Cannot find module '../src/useAsyncFormulas'".

- [ ] **Step 3: Create `src/useAsyncFormulas.ts`**

```typescript
import { useState, useRef, useEffect, useCallback } from 'react'
import type { FormulaField } from './analyzeSchema'
import { expandPaths, enrich } from './enrich'
import type { BuildContextOptions } from './buildContext'

type FieldState = 'idle' | 'running' | 'dirty'

function pathKey(path: (string | number)[]): string {
  return JSON.stringify(path)
}

export function useAsyncFormulas(
  formData: unknown,
  formulaFields: FormulaField[],
  evaluator: (formula: string, context: object) => unknown | Promise<unknown>,
  debounceMs: number,
  maxConvergencePasses: number,
  onFormulaError: ((path: (string | number)[], error: Error) => void) | undefined,
  onLoadingChange: ((loadingPaths: (string | number)[][]) => void) | undefined,
  contextOptions: BuildContextOptions
): { enrichedFormData: unknown; handleInput: (newFormData: unknown) => void } {
  const [enrichedFormData, setEnrichedFormData] = useState<unknown>(formData)

  const pendingInputRef = useRef<unknown>(formData)
  const fieldStateRef = useRef<Map<string, FieldState>>(new Map())
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const runningRef = useRef(false)

  // Stable refs so callbacks/config don't require restarting the debounce
  const onFormulaErrorRef = useRef(onFormulaError)
  const onLoadingChangeRef = useRef(onLoadingChange)
  const evaluatorRef = useRef(evaluator)
  const formulaFieldsRef = useRef(formulaFields)
  const maxPassesRef = useRef(maxConvergencePasses)
  const contextOptionsRef = useRef(contextOptions)

  useEffect(() => { onFormulaErrorRef.current = onFormulaError }, [onFormulaError])
  useEffect(() => { onLoadingChangeRef.current = onLoadingChange }, [onLoadingChange])
  useEffect(() => { evaluatorRef.current = evaluator }, [evaluator])
  useEffect(() => { formulaFieldsRef.current = formulaFields }, [formulaFields])
  useEffect(() => { maxPassesRef.current = maxConvergencePasses }, [maxConvergencePasses])
  useEffect(() => { contextOptionsRef.current = contextOptions }, [contextOptions])

  // startSequence reads all config from refs so it is stable across renders
  const startSequence = useCallback(() => {
    if (runningRef.current) return

    const run = async () => {
      runningRef.current = true

      while (true) {
        const input = pendingInputRef.current
        const fields = formulaFieldsRef.current

        // Collect concrete paths for loading reporting
        const concretePaths: (string | number)[][] = []
        for (const field of fields) {
          for (const cp of expandPaths(field.path, input)) {
            concretePaths.push(cp)
          }
        }

        // Mark all fields running
        const stateMap = fieldStateRef.current
        stateMap.clear()
        for (const cp of concretePaths) stateMap.set(pathKey(cp), 'running')
        if (concretePaths.length > 0) onLoadingChangeRef.current?.(concretePaths)

        const result = await enrich(
          input,
          fields,
          evaluatorRef.current,
          maxPassesRef.current,
          onFormulaErrorRef.current,
          contextOptionsRef.current.formulaDataKey,
          contextOptionsRef.current.formulaPathKey
        )

        const anyDirty = [...stateMap.values()].some(s => s === 'dirty')
        stateMap.clear()

        setEnrichedFormData(result)

        if (!anyDirty) {
          if (concretePaths.length > 0) onLoadingChangeRef.current?.([])
          break
        }
        // New input arrived while evaluating — re-run with pendingInputRef.current
      }

      runningRef.current = false
    }

    run()
  }, []) // stable: all dependencies accessed via refs

  const handleInput = useCallback(
    (newFormData: unknown) => {
      pendingInputRef.current = newFormData

      // Flip any running fields to dirty
      const stateMap = fieldStateRef.current
      for (const [key, state] of stateMap) {
        if (state === 'running') stateMap.set(key, 'dirty')
      }

      // Only manage debounce when no sequence is in flight;
      // the while loop picks up dirty fields automatically
      if (!runningRef.current) {
        if (debounceTimerRef.current !== null) clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = setTimeout(() => {
          debounceTimerRef.current = null
          startSequence()
        }, debounceMs)
      }
    },
    [debounceMs, startSequence]
  )

  // React to external formData prop changes
  useEffect(() => {
    handleInput(formData)
  }, [formData]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup debounce on unmount
  useEffect(
    () => () => {
      if (debounceTimerRef.current !== null) clearTimeout(debounceTimerRef.current)
    },
    []
  )

  return { enrichedFormData, handleInput }
}
```

- [ ] **Step 4: Run the hook tests**

```bash
bunx vitest run tests/useAsyncFormulas.test.tsx
```

Expected: all tests PASS across both `rjsf-v6-react` and `rjsf-v5-react` projects.

- [ ] **Step 5: Commit**

```bash
git add src/useAsyncFormulas.ts tests/useAsyncFormulas.test.tsx
git commit -m "feat: add useAsyncFormulas hook with debounce and per-field state machine"
```

---

## Task 3: Update `FormulaForm` to use the hook

**Files:**
- Modify: `src/FormulaForm.tsx`
- Modify: `tests/FormulaForm.test.tsx`

- [ ] **Step 1: Update `tests/FormulaForm.test.tsx` with new tests**

Replace the entire file content with the following. Key changes from the previous version:
- The mount test is rewritten: `onChange` is no longer called on mount; instead verify the inner form receives enriched formData after debounce
- The onChange test is rewritten: `onChange` now fires immediately with raw data; enriched values arrive via re-render
- Two new describe blocks are added at the end for `debounceMs` and `onLoadingChange`

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import React from 'react'
import Form from '@rjsf/core'
import validator from '@rjsf/validator-ajv8'
import { FormulaForm } from '../src/FormulaForm'

const evalSimple = (formula: string, ctx: object) =>
  new Function(...Object.keys(ctx), `return ${formula}`)(...Object.values(ctx))

afterEach(() => {
  vi.useRealTimers()
})

describe('FormulaForm — mount', () => {
  it('renders inner form with enriched formData after debounce fires on mount', async () => {
    vi.useFakeTimers()
    const MockForm = vi.fn(() => <div />)
    const schema = {
      type: 'object',
      properties: {
        price: { type: 'number' },
        quantity: { type: 'number' },
        total: { type: 'number', 'x-formula': 'price * quantity' },
      },
    }
    render(
      <FormulaForm
        schema={schema as any}
        formData={{ price: 10, quantity: 3, total: 0 }}
        validator={validator}
        evaluator={evalSimple}
        Form={MockForm as any}
      />
    )

    await act(async () => { await vi.advanceTimersByTimeAsync(300) })

    const lastCall = MockForm.mock.calls[MockForm.mock.calls.length - 1]
    expect(lastCall[0].formData).toEqual({ price: 10, quantity: 3, total: 30 })
  })
})

describe('FormulaForm — onChange', () => {
  it('fires onChange immediately with raw data on user edit', async () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    const schema = {
      type: 'object',
      properties: {
        price: { type: 'number' },
        quantity: { type: 'number' },
        total: { type: 'number', 'x-formula': 'price * quantity' },
      },
    }

    const MockForm = vi.fn(({ onChange: innerOnChange }: any) => (
      <button
        onClick={() => innerOnChange({ formData: { price: 5, quantity: 4, total: 30 } })}
      >
        change
      </button>
    ))

    const { getByText } = render(
      <FormulaForm
        schema={schema as any}
        formData={{ price: 10, quantity: 3, total: 0 }}
        validator={validator}
        evaluator={evalSimple}
        onChange={onChange}
        Form={MockForm as any}
      />
    )

    // Let mount evaluation complete
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    onChange.mockClear()

    // User edits a field
    act(() => { getByText('change').click() })

    // onChange fires immediately with the raw data from RJSF
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ formData: { price: 5, quantity: 4, total: 30 } }),
      undefined
    )
  })

  it('inner form re-renders with enriched data after debounce following user edit', async () => {
    vi.useFakeTimers()
    const schema = {
      type: 'object',
      properties: {
        price: { type: 'number' },
        quantity: { type: 'number' },
        total: { type: 'number', 'x-formula': 'price * quantity' },
      },
    }

    const MockForm = vi.fn(({ onChange: innerOnChange }: any) => (
      <button
        onClick={() => innerOnChange({ formData: { price: 5, quantity: 4, total: 30 } })}
      >
        change
      </button>
    ))

    const { getByText } = render(
      <FormulaForm
        schema={schema as any}
        formData={{ price: 10, quantity: 3, total: 0 }}
        validator={validator}
        evaluator={evalSimple}
        Form={MockForm as any}
      />
    )

    await act(async () => { await vi.advanceTimersByTimeAsync(300) })

    act(() => { getByText('change').click() })

    await act(async () => { await vi.advanceTimersByTimeAsync(300) })

    const lastCall = MockForm.mock.calls[MockForm.mock.calls.length - 1]
    expect(lastCall[0].formData).toEqual({ price: 5, quantity: 4, total: 20 })
  })
})

describe('FormulaForm — custom Form prop', () => {
  it('renders a custom Form component when provided', async () => {
    vi.useFakeTimers()
    const MockForm = vi.fn(() => <div data-testid="custom-form" />)
    const schema = { type: 'object', properties: {} }
    const { getByTestId } = render(
      <FormulaForm
        schema={schema as any}
        formData={{}}
        validator={validator}
        evaluator={evalSimple}
        onChange={vi.fn()}
        Form={MockForm as any}
      />
    )
    expect(getByTestId('custom-form')).toBeTruthy()
    expect(MockForm).toHaveBeenCalled()
  })
})

describe('FormulaForm — read-only injection', () => {
  it('passes mergedUiSchema with ui:readonly on computed fields to the inner Form', async () => {
    vi.useFakeTimers()
    const MockForm = vi.fn(() => <div />)
    const schema = {
      type: 'object',
      properties: {
        a: { type: 'number' },
        total: { type: 'number', 'x-formula': 'a * 2' },
      },
    }
    render(
      <FormulaForm
        schema={schema as any}
        formData={{ a: 1, total: 0 }}
        validator={validator}
        evaluator={evalSimple}
        onChange={vi.fn()}
        Form={MockForm as any}
      />
    )
    const receivedUiSchema = MockForm.mock.calls[0][0].uiSchema
    expect(receivedUiSchema?.total?.['ui:readonly']).toBe(true)
  })

  it('preserves user-supplied uiSchema entries alongside injected read-only', async () => {
    vi.useFakeTimers()
    const MockForm = vi.fn(() => <div />)
    const schema = {
      type: 'object',
      properties: {
        a: { type: 'number' },
        total: { type: 'number', 'x-formula': 'a * 2' },
      },
    }
    const uiSchema = { a: { 'ui:widget': 'updown' } }
    render(
      <FormulaForm
        schema={schema as any}
        formData={{ a: 1, total: 0 }}
        uiSchema={uiSchema}
        validator={validator}
        evaluator={evalSimple}
        onChange={vi.fn()}
        Form={MockForm as any}
      />
    )
    const received = MockForm.mock.calls[0][0].uiSchema
    expect(received?.a?.['ui:widget']).toBe('updown')
    expect(received?.total?.['ui:readonly']).toBe(true)
  })
})

describe('FormulaForm — nested objects', () => {
  it('enriches a computed field nested inside an object', async () => {
    vi.useFakeTimers()
    const MockForm = vi.fn(() => <div />)
    const schema = {
      type: 'object',
      properties: {
        order: {
          type: 'object',
          properties: {
            price: { type: 'number' },
            quantity: { type: 'number' },
            total: { type: 'number', 'x-formula': 'price * quantity' },
          },
        },
      },
    }
    render(
      <FormulaForm
        schema={schema as any}
        formData={{ order: { price: 4, quantity: 5, total: 0 } }}
        validator={validator}
        evaluator={evalSimple}
        onChange={vi.fn()}
        Form={MockForm as any}
      />
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    const lastCall = MockForm.mock.calls[MockForm.mock.calls.length - 1]
    expect(lastCall[0].formData.order.total).toBe(20)
  })
})

describe('FormulaForm — custom keys', () => {
  it('uses a custom formulaKey to detect computed fields', async () => {
    vi.useFakeTimers()
    const MockForm = vi.fn(() => <div />)
    const schema = {
      type: 'object',
      properties: {
        a: { type: 'number' },
        b: { type: 'number', 'x-calc': 'a * 3' },
      },
    }
    render(
      <FormulaForm
        schema={schema as any}
        formData={{ a: 4, b: 0 }}
        validator={validator}
        evaluator={evalSimple}
        onChange={vi.fn()}
        formulaKey="x-calc"
        Form={MockForm as any}
      />
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    const lastCall = MockForm.mock.calls[MockForm.mock.calls.length - 1]
    expect(lastCall[0].formData.b).toBe(12)
  })
})

describe('FormulaForm — error handling', () => {
  it('calls onFormulaError and sets field to undefined when evaluator throws', async () => {
    vi.useFakeTimers()
    const MockForm = vi.fn(() => <div />)
    const onFormulaError = vi.fn()
    const schema = {
      type: 'object',
      properties: {
        a: { type: 'number' },
        bad: { type: 'number', 'x-formula': 'throw_error' },
        good: { type: 'number', 'x-formula': 'a + 1' },
      },
    }
    const brokenEval = (formula: string, ctx: object) => {
      if (formula === 'throw_error') throw new Error('boom')
      return evalSimple(formula, ctx)
    }
    render(
      <FormulaForm
        schema={schema as any}
        formData={{ a: 5, bad: 0, good: 0 }}
        validator={validator}
        evaluator={brokenEval}
        onChange={vi.fn()}
        onFormulaError={onFormulaError}
        Form={MockForm as any}
      />
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    const lastCall = MockForm.mock.calls[MockForm.mock.calls.length - 1]
    expect(lastCall[0].formData.bad).toBeUndefined()
    expect(lastCall[0].formData.good).toBe(6)
    expect(onFormulaError).toHaveBeenCalledWith(['bad'], expect.any(Error))
  })
})

describe('FormulaForm — extended context', () => {
  it('makes __formData__ available when x-formula-context is extended', async () => {
    vi.useFakeTimers()
    const MockForm = vi.fn(() => <div />)
    const schema = {
      type: 'object',
      properties: {
        tax: { type: 'number' },
        subtotal: { type: 'number' },
        total: {
          type: 'number',
          'x-formula': '__formData__.tax + __formData__.subtotal',
          'x-formula-context': 'extended',
        },
      },
    }
    render(
      <FormulaForm
        schema={schema as any}
        formData={{ tax: 5, subtotal: 100, total: 0 }}
        validator={validator}
        evaluator={evalSimple}
        onChange={vi.fn()}
        Form={MockForm as any}
      />
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    const lastCall = MockForm.mock.calls[MockForm.mock.calls.length - 1]
    expect(lastCall[0].formData.total).toBe(105)
  })

  it('uses custom formulaDataKey when provided', async () => {
    vi.useFakeTimers()
    const MockForm = vi.fn(() => <div />)
    const schema = {
      type: 'object',
      properties: {
        tax: { type: 'number' },
        subtotal: { type: 'number' },
        total: {
          type: 'number',
          'x-formula': 'fd.tax + fd.subtotal',
          'x-formula-context': 'extended',
        },
      },
    }
    render(
      <FormulaForm
        schema={schema as any}
        formData={{ tax: 5, subtotal: 100, total: 0 }}
        validator={validator}
        evaluator={evalSimple}
        onChange={vi.fn()}
        formulaDataKey="fd"
        Form={MockForm as any}
      />
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    const lastCall = MockForm.mock.calls[MockForm.mock.calls.length - 1]
    expect(lastCall[0].formData.total).toBe(105)
  })

  it('uses custom formulaPathKey when provided', async () => {
    vi.useFakeTimers()
    const MockForm = vi.fn(() => <div />)
    const capturedContexts: object[] = []
    const capturingEval = (formula: string, ctx: object) => {
      capturedContexts.push(ctx)
      return evalSimple(formula, ctx)
    }
    const schema = {
      type: 'object',
      properties: {
        a: { type: 'number' },
        b: {
          type: 'number',
          'x-formula': 'a * 2',
          'x-formula-context': 'extended',
        },
      },
    }
    render(
      <FormulaForm
        schema={schema as any}
        formData={{ a: 3, b: 0 }}
        validator={validator}
        evaluator={capturingEval}
        onChange={vi.fn()}
        formulaPathKey="myPath"
        Form={MockForm as any}
      />
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    const ctx = capturedContexts[0] as any
    expect(ctx.myPath).toEqual(['b'])
    expect(ctx.__path__).toBeUndefined()
  })
})

describe('FormulaForm — debounceMs prop', () => {
  it('uses a custom debounceMs value', async () => {
    vi.useFakeTimers()
    const evaluator = vi.fn().mockImplementation(evalSimple)
    const schema = {
      type: 'object',
      properties: {
        a: { type: 'number' },
        b: { type: 'number', 'x-formula': 'a * 2' },
      },
    }
    render(
      <FormulaForm
        schema={schema as any}
        formData={{ a: 1, b: 0 }}
        validator={validator}
        evaluator={evaluator}
        onChange={vi.fn()}
        debounceMs={500}
        Form={vi.fn(() => <div />) as any}
      />
    )

    // Should not evaluate before 500ms
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(evaluator).not.toHaveBeenCalled()

    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    expect(evaluator).toHaveBeenCalled()
  })
})

describe('FormulaForm — onLoadingChange prop', () => {
  it('calls onLoadingChange with in-flight paths and then []', async () => {
    vi.useFakeTimers()
    const onLoadingChange = vi.fn()
    const schema = {
      type: 'object',
      properties: {
        a: { type: 'number' },
        b: { type: 'number', 'x-formula': 'a * 2' },
      },
    }
    render(
      <FormulaForm
        schema={schema as any}
        formData={{ a: 3, b: 0 }}
        validator={validator}
        evaluator={evalSimple}
        onChange={vi.fn()}
        onLoadingChange={onLoadingChange}
        Form={vi.fn(() => <div />) as any}
      />
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })

    expect(onLoadingChange).toHaveBeenNthCalledWith(1, [['b']])
    expect(onLoadingChange).toHaveBeenNthCalledWith(2, [])
  })
})
```

- [ ] **Step 2: Run new tests to verify they fail**

```bash
bunx vitest run tests/FormulaForm.test.tsx
```

Expected: the new and updated tests FAIL because `FormulaForm` still uses the old synchronous `useMemo` enrichment and doesn't have `debounceMs`/`onLoadingChange` props. The old tests that now use `advanceTimersByTimeAsync` will time out or fail.

- [ ] **Step 3: Implement the updated `src/FormulaForm.tsx`**

Replace the entire file with:

```typescript
import React, { useMemo } from 'react'
import Form from '@rjsf/core'
import type { FormProps, IChangeEvent, StrictRJSFSchema, RJSFSchema, FormContextType } from '@rjsf/utils'
import { analyzeSchema } from './analyzeSchema'
import type { FormulaField } from './analyzeSchema'
import { useAsyncFormulas } from './useAsyncFormulas'
import { mergeReadOnly } from './mergeReadOnly'
import type { BuildContextOptions } from './buildContext'

export type FormulaFormProps<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any
> = FormProps<T, S, F> & {
  evaluator: (formula: string, context: object) => unknown | Promise<unknown>
  Form?: React.ComponentType<FormProps<T, S, F>>
  formulaKey?: string
  formulaContextKey?: string
  formulaDataKey?: string
  formulaPathKey?: string
  maxConvergencePasses?: number
  debounceMs?: number
  onFormulaError?: (path: (string | number)[], error: Error) => void
  onLoadingChange?: (loadingPaths: (string | number)[][]) => void
}

export function FormulaForm<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any
>(props: FormulaFormProps<T, S, F>): JSX.Element {
  const {
    schema,
    formData,
    uiSchema,
    evaluator,
    Form: InnerForm = Form as React.ComponentType<FormProps<T, S, F>>,
    formulaKey = 'x-formula',
    formulaContextKey = 'x-formula-context',
    formulaDataKey = '__formData__',
    formulaPathKey = '__path__',
    maxConvergencePasses = 10,
    debounceMs = 300,
    onFormulaError,
    onLoadingChange,
    onChange,
    ...rest
  } = props

  const formulaFields: FormulaField[] = useMemo(
    () => analyzeSchema(schema as RJSFSchema, { formulaKey, formulaContextKey }),
    [schema, formulaKey, formulaContextKey]
  )

  const contextOptions: BuildContextOptions = useMemo(
    () => ({ formulaDataKey, formulaPathKey }),
    [formulaDataKey, formulaPathKey]
  )

  const mergedUiSchema = useMemo(
    () => mergeReadOnly(uiSchema as Record<string, unknown> | undefined, formulaFields),
    [uiSchema, formulaFields]
  )

  const { enrichedFormData, handleInput } = useAsyncFormulas(
    formData,
    formulaFields,
    evaluator,
    debounceMs,
    maxConvergencePasses,
    onFormulaError,
    onLoadingChange,
    contextOptions
  )

  const handleChange = (data: IChangeEvent<T, S, F>, id?: string) => {
    handleInput(data.formData)
    onChange?.({ ...data, formData: data.formData as T }, id)
  }

  return (
    <InnerForm
      {...rest}
      schema={schema}
      formData={enrichedFormData as T}
      uiSchema={mergedUiSchema as any}
      onChange={handleChange}
    />
  )
}
```

- [ ] **Step 4: Run the full test suite**

```bash
bunx vitest run tests/FormulaForm.test.tsx
```

Expected: all tests PASS across both `rjsf-v6-react` and `rjsf-v5-react` projects.

Then run the full suite to confirm no regressions:

```bash
bunx vitest run
```

Expected: all tests pass across all 4 projects (`rjsf-v6`, `rjsf-v5`, `rjsf-v6-react`, `rjsf-v5-react`).

- [ ] **Step 5: Commit**

```bash
git add src/FormulaForm.tsx tests/FormulaForm.test.tsx
git commit -m "feat: update FormulaForm to use useAsyncFormulas hook with debounceMs and onLoadingChange"
```
