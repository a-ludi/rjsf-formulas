# `refreshRef` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `refreshRef` prop to `FormulaForm` that lets callers force formula re-evaluation and await its completion.

**Architecture:** `useAsyncFormulas` gains a `refresh()` function backed by a resolver-queue ref and a `forceRerunRef` flag. `FormulaFormImpl` accepts `refreshRef` and wires the function in via a mount/unmount effect. No new files are needed.

**Tech Stack:** React (hooks, refs, effects), TypeScript, Vitest, `@testing-library/react` (`renderHook`, `render`, `act`).

**Spec:** `docs/superpowers/specs/2026-11-27-refreshRef-design.md`

---

## File map

| Action | File | What changes |
|---|---|---|
| Modify | `src/useAsyncFormulas.ts` | Add `refreshResolversRef`, `forceRerunRef`, `refresh`; patch while-loop break + `finally`; update cleanup + return type |
| Modify | `src/FormulaForm.tsx` | Add `refreshRef` to `FormulaFormProps`; destructure + wire in `FormulaFormImpl` |
| Modify | `tests/useAsyncFormulas.test.tsx` | New `describe` block: 6 refresh tests |
| Modify | `tests/FormulaForm.test.tsx` | New `describe` block: 3 refreshRef tests |
| Modify | `CHANGELOG.md` | Add entry under `[Unreleased] > Added` |

---

## Task 1 — Failing hook tests for `refresh()`

**Files:**
- Modify: `tests/useAsyncFormulas.test.tsx` (append a new `describe` block at the end)

- [ ] **Step 1: Append the following `describe` block to `tests/useAsyncFormulas.test.tsx`**

```ts
describe('useAsyncFormulas — refresh', () => {
  it('refresh() evaluates immediately without waiting for debounce', async () => {
    vi.useFakeTimers()
    const evaluator = vi.fn().mockImplementation(evalSimple)
    const fields = [field(['total'], 'price * quantity')]
    const { result } = renderHook(() =>
      useAsyncFormulas(
        { price: 2, quantity: 3, total: 0 },
        fields, evaluator, 300, 10,
        undefined, undefined, ctxOpts, () => true, 'warn', 'always', v => v
      )
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    evaluator.mockClear()

    // No timer advance — refresh() must bypass the debounce entirely
    await act(async () => { await result.current.refresh() })

    expect(evaluator).toHaveBeenCalledTimes(1)
  })

  it('promise from refresh() resolves after sync evaluation settles', async () => {
    const fields = [field(['total'], 'price * quantity')]
    const { result } = renderHook(() =>
      useAsyncFormulas(
        { price: 2, quantity: 3, total: 0 },
        fields, evalSimple, 0, 10,
        undefined, undefined, ctxOpts, () => true, 'warn', 'skip', v => v
      )
    )

    await act(async () => { await result.current.refresh() })

    expect((result.current.enrichedFormData as any).total).toBe(6)
  })

  it('promise from refresh() resolves after async evaluation settles', async () => {
    const asyncEval = async (formula: string, ctx: object) => evalSimple(formula, ctx)
    const fields = [field(['total'], 'price * quantity')]
    const { result } = renderHook(() =>
      useAsyncFormulas(
        { price: 2, quantity: 3, total: 0 },
        fields, asyncEval, 0, 10,
        undefined, undefined, ctxOpts, () => true, 'warn', 'skip', v => v
      )
    )

    await act(async () => { await result.current.refresh() })

    expect((result.current.enrichedFormData as any).total).toBe(6)
  })

  it('refresh() mid-run causes an extra pass and both promises resolve', async () => {
    // Manually-gated evaluator: each call pushes a resolve function into `gates`
    const gates: Array<() => void> = []
    const blockedEval = (_: string, ctx: any) =>
      new Promise<unknown>(resolve => { gates.push(() => resolve(evalSimple(_, ctx))) })

    const fields = [field(['total'], 'price * quantity')]
    const { result } = renderHook(() =>
      useAsyncFormulas(
        { price: 2, quantity: 3, total: 0 },
        fields, blockedEval, 0, 10,
        undefined, undefined, ctxOpts, () => true, 'warn', 'skip', v => v
      )
    )

    let p1Resolved = false, p2Resolved = false

    // Both calls happen synchronously; second hits the runningRef guard.
    // applyAllFormulas calls the evaluator synchronously before its first await,
    // so gates[0] is populated here without needing a microtask flush.
    act(() => {
      result.current.refresh().then(() => { p1Resolved = true })
      result.current.refresh().then(() => { p2Resolved = true })
    })

    expect(gates).toHaveLength(1)  // pass 1 in flight

    // Resolve pass 1 → loop sees forceRerunRef=true → starts pass 2
    await act(async () => { gates[0]() })
    expect(gates).toHaveLength(2)  // pass 2 started
    expect(p1Resolved).toBe(false) // still pending

    // Resolve pass 2 → converges → finally drains all resolvers
    await act(async () => { gates[1]() })
    expect(p1Resolved).toBe(true)
    expect(p2Resolved).toBe(true)
  })

  it('multiple concurrent refresh() calls each return a promise that resolves', async () => {
    const fields = [field(['total'], 'price * quantity')]
    const { result } = renderHook(() =>
      useAsyncFormulas(
        { price: 2, quantity: 3, total: 0 },
        fields, evalSimple, 0, 10,
        undefined, undefined, ctxOpts, () => true, 'warn', 'skip', v => v
      )
    )

    await act(async () => {
      const p1 = result.current.refresh()
      const p2 = result.current.refresh()
      await Promise.all([p1, p2])
    })

    expect((result.current.enrichedFormData as any).total).toBe(6)
  })

  it('promise from refresh() resolves when component unmounts before evaluation completes', async () => {
    const gates: Array<() => void> = []
    const blockedEval = (_: string, ctx: any) =>
      new Promise<unknown>(resolve => { gates.push(() => resolve(evalSimple(_, ctx))) })

    const fields = [field(['total'], 'price * quantity')]
    const { result, unmount } = renderHook(() =>
      useAsyncFormulas(
        { price: 2, quantity: 3, total: 0 },
        fields, blockedEval, 0, 10,
        undefined, undefined, ctxOpts, () => true, 'warn', 'skip', v => v
      )
    )

    let resolved = false
    act(() => { result.current.refresh().then(() => { resolved = true }) })
    expect(resolved).toBe(false)  // evaluator not yet unblocked

    // Unmount while evaluation is in flight
    act(() => { unmount() })
    expect(resolved).toBe(true)  // cleanup must drain the resolver queue

    // Let the in-flight run() see isUnmountedRef and exit cleanly
    await act(async () => { gates[0]?.() })
  })
})
```

- [ ] **Step 2: Run the new tests and confirm they all fail**

```bash
cd /home/claude/projects/rjsf-formulas && npx vitest run tests/useAsyncFormulas.test.tsx
```

Expected: TypeScript error or runtime failure — `result.current.refresh` does not exist yet. All 6 new tests must be red before proceeding.

---

## Task 2 — Implement `refresh` in `useAsyncFormulas`

**Files:**
- Modify: `src/useAsyncFormulas.ts`

- [ ] **Step 1: Update the return type annotation (line 26)**

Change:
```ts
): { enrichedFormData: unknown; handleInput: (newFormData: unknown) => void } {
```
To:
```ts
): { enrichedFormData: unknown; handleInput: (newFormData: unknown) => void; refresh: () => Promise<void> } {
```

- [ ] **Step 2: Add `refreshResolversRef` and `forceRerunRef` after `runningRef` (after line 34)**

```ts
  const refreshResolversRef = useRef<Array<() => void>>([])
  const forceRerunRef = useRef(false)
```

- [ ] **Step 3: Patch the while-loop break condition in `startSequence` (lines 106–111)**

Change:
```ts
          if (!anyDirty) {
            lastEvalResultRef.current = result
            setEnrichedFormData(result)
            if (concretePaths.length > 0) onLoadingChangeRef.current?.([])
            break
          }
```
To:
```ts
          const shouldRerun = anyDirty || forceRerunRef.current
          forceRerunRef.current = false
          if (!shouldRerun) {
            lastEvalResultRef.current = result
            setEnrichedFormData(result)
            if (concretePaths.length > 0) onLoadingChangeRef.current?.([])
            break
          }
```

- [ ] **Step 4: Drain resolvers in the `finally` block (lines 114–116)**

Change:
```ts
      } finally {
        runningRef.current = false
      }
```
To:
```ts
      } finally {
        runningRef.current = false
        const resolvers = refreshResolversRef.current.splice(0)
        for (const r of resolvers) r()
      }
```

- [ ] **Step 5: Add the `refresh` callback after `startSequence` (after the `}, [])` closing `startSequence`)**

```ts
  const refresh = useCallback((): Promise<void> => {
    return new Promise(resolve => {
      refreshResolversRef.current.push(resolve)
      forceRerunRef.current = true
      startSequence()
    })
  }, [startSequence])
```

- [ ] **Step 6: Drain resolvers in the mount/unmount cleanup effect (lines 184–189)**

Change:
```ts
    return () => {
      isUnmountedRef.current = true
      hasMountedRef.current = false  // allow re-init on next mount (React StrictMode)
      lastEvalResultRef.current = undefined
      if (debounceTimerRef.current !== null) clearTimeout(debounceTimerRef.current)
    }
```
To:
```ts
    return () => {
      isUnmountedRef.current = true
      hasMountedRef.current = false  // allow re-init on next mount (React StrictMode)
      lastEvalResultRef.current = undefined
      if (debounceTimerRef.current !== null) clearTimeout(debounceTimerRef.current)
      const resolvers = refreshResolversRef.current.splice(0)
      for (const r of resolvers) r()
    }
```

- [ ] **Step 7: Update the return statement (line 192)**

Change:
```ts
  return { enrichedFormData, handleInput }
```
To:
```ts
  return { enrichedFormData, handleInput, refresh }
```

- [ ] **Step 8: Run the hook tests and confirm all 6 new tests pass**

```bash
cd /home/claude/projects/rjsf-formulas && npx vitest run tests/useAsyncFormulas.test.tsx
```

Expected: all tests pass, including all pre-existing ones.

- [ ] **Step 9: Commit**

```bash
cd /home/claude/projects/rjsf-formulas && git add src/useAsyncFormulas.ts tests/useAsyncFormulas.test.tsx && git commit -m "feat: add refresh() to useAsyncFormulas with forceRerunRef and resolver queue"
```

---

## Task 3 — Failing component tests for `refreshRef`

**Files:**
- Modify: `tests/FormulaForm.test.tsx` (append a new `describe` block at the end)

- [ ] **Step 1: Append the following `describe` block to `tests/FormulaForm.test.tsx`**

```tsx
describe('FormulaForm — refreshRef', () => {
  it('populates refreshRef.current after mount', async () => {
    vi.useFakeTimers()
    const refreshRef = { current: null } as React.MutableRefObject<(() => Promise<void>) | null>

    render(
      <FormulaForm
        schema={basic.schema as any}
        formData={basic.formData as any}
        validator={validator}
        evaluator={evalSimple}
        refreshRef={refreshRef}
        Form={vi.fn(() => <div />) as any}
      />
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })

    expect(refreshRef.current).toBeTypeOf('function')
  })

  it('sets refreshRef.current to null after unmount', async () => {
    vi.useFakeTimers()
    const refreshRef = { current: null } as React.MutableRefObject<(() => Promise<void>) | null>

    const { unmount } = render(
      <FormulaForm
        schema={basic.schema as any}
        formData={basic.formData as any}
        validator={validator}
        evaluator={evalSimple}
        refreshRef={refreshRef}
        Form={vi.fn(() => <div />) as any}
      />
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(refreshRef.current).toBeTypeOf('function')

    act(() => { unmount() })
    expect(refreshRef.current).toBeNull()
  })

  it('calling refreshRef.current() re-evaluates formulas and resolves', async () => {
    vi.useFakeTimers()
    const refreshRef = { current: null } as React.MutableRefObject<(() => Promise<void>) | null>
    const MockForm = vi.fn<(props: any) => React.ReactElement>(() => <div />)

    render(
      <FormulaForm
        schema={basic.schema as any}
        formData={basic.formData as any}
        validator={validator}
        evaluator={evalSimple}
        refreshRef={refreshRef}
        Form={MockForm as any}
      />
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    MockForm.mockClear()

    await act(async () => { await refreshRef.current!() })

    const lastCall = MockForm.mock.calls[MockForm.mock.calls.length - 1]
    expect(lastCall[0].formData).toEqual({ price: 10, quantity: 3, total: 30 })
  })
})
```

- [ ] **Step 2: Run the new component tests and confirm they all fail**

```bash
cd /home/claude/projects/rjsf-formulas && npx vitest run tests/FormulaForm.test.tsx
```

Expected: TypeScript error or runtime failure — `refreshRef` prop does not exist on `FormulaFormProps` yet. All 3 new tests must be red before proceeding.

---

## Task 4 — Implement `refreshRef` prop in `FormulaForm`

**Files:**
- Modify: `src/FormulaForm.tsx`

- [ ] **Step 1: Add `refreshRef` to `FormulaFormProps` after the `convergenceKey` prop (after line 122)**

```ts
  /**
   * Ref that receives the `refresh` function on mount and is set to `null` on unmount.
   * Call `refreshRef.current?.()` to force formula re-evaluation outside the normal
   * debounce/input cycle. The returned `Promise<void>` resolves when evaluation converges.
   */
  refreshRef?: React.MutableRefObject<(() => Promise<void>) | null>
```

- [ ] **Step 2: Destructure `refreshRef` in `FormulaFormImpl` (add it alongside `onChange` in the existing destructure block, lines 166–186)**

Change the destructure to include `refreshRef`:
```ts
    convergenceKey = (v: unknown) => v,
    onChange,
    refreshRef,
    ...rest
```

- [ ] **Step 3: Expand the `useAsyncFormulas` destructure to include `refresh` (line 225)**

Change:
```ts
  const { enrichedFormData, handleInput } = useAsyncFormulas(
```
To:
```ts
  const { enrichedFormData, handleInput, refresh } = useAsyncFormulas(
```

- [ ] **Step 4: Add the wiring effect after the `useAsyncFormulas` call (after line 238)**

```ts
  useEffect(() => {
    if (!refreshRef) return
    refreshRef.current = refresh
    return () => { refreshRef.current = null }
  }, [refresh, refreshRef])
```

- [ ] **Step 5: Run the full test suite and confirm all 9 new tests pass**

```bash
cd /home/claude/projects/rjsf-formulas && npx vitest run
```

Expected: all tests pass. No pre-existing tests regress.

- [ ] **Step 6: Commit**

```bash
cd /home/claude/projects/rjsf-formulas && git add src/FormulaForm.tsx tests/FormulaForm.test.tsx && git commit -m "feat: add refreshRef prop to FormulaForm (closes #7)"
```

---

## Task 5 — CHANGELOG

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add entry under `[Unreleased] > Added` in `CHANGELOG.md`**

```markdown
### Added
- `refreshRef` prop on `FormulaForm`: pass a `MutableRefObject<(() => Promise<void>) | null>` to get an imperative handle for forcing formula re-evaluation outside the normal debounce cycle. The returned `Promise<void>` resolves when evaluation has converged. ([#7](https://github.com/a-ludi/rjsf-formulas/issues/7))
```

- [ ] **Step 2: Run the full test suite one final time**

```bash
cd /home/claude/projects/rjsf-formulas && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
cd /home/claude/projects/rjsf-formulas && git add CHANGELOG.md && git commit -m "docs: document refreshRef in CHANGELOG"
```
