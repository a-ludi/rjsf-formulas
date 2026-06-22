# Suppress Intermediate Formula Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `useAsyncFormulas` from publishing a stale intermediate result when new input arrives during an async evaluation, eliminating erratic computed-field flicker.

**Architecture:** In the `while(true)` loop inside `startSequence`, `setEnrichedFormData(result)` is moved inside the `!anyDirty` branch. Stale results from dirty runs are discarded; only the final clean result is committed to React state. `onLoadingChange` is unaffected — it already stays active across dirty re-runs.

**Tech Stack:** TypeScript, React hooks, Vitest, `@testing-library/react`

---

### Task 1: Add a failing regression test

**Files:**
- Modify: `tests/useAsyncFormulas.test.tsx` — add one test inside the existing `'dirty state (in-flight re-evaluation)'` describe block

- [ ] **Step 1: Write the failing test**

Add this test after the existing test in the `'dirty state'` describe block (around line 243 of `tests/useAsyncFormulas.test.tsx`):

```ts
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
      ctxOpts
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

  // KEY ASSERTION: enrichedFormData must NOT show the stale run-1 result (total: 6).
  // It should retain the value from before the stale run (total: 99).
  expect((result.current.enrichedFormData as any).total).toBe(99)

  // Let run 2 complete — it produces the correct result.
  await act(async () => { resolveSecondRun() })
  await act(async () => { await Promise.resolve() })
  expect((result.current.enrichedFormData as any).total).toBe(20)
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd /home/claude/projects/rjsf-formulas
bun test tests/useAsyncFormulas.test.tsx 2>&1 | grep -A 5 'does not publish'
```

Expected: test fails at the key assertion — `total` is `6` instead of `99`.

---

### Task 2: Apply the fix

**Files:**
- Modify: `src/useAsyncFormulas.ts` lines 83–91

- [ ] **Step 3: Move `setEnrichedFormData` inside the `!anyDirty` branch**

In `src/useAsyncFormulas.ts`, find the block after `stateMap.clear()` in the `while(true)` loop and replace it:

```ts
// BEFORE (around lines 83–91):
          const anyDirty = [...stateMap.values()].some(s => s === 'dirty')
          stateMap.clear()

          setEnrichedFormData(result)

          if (!anyDirty) {
            if (concretePaths.length > 0) onLoadingChangeRef.current?.([])
            break
          }

// AFTER:
          const anyDirty = [...stateMap.values()].some(s => s === 'dirty')
          stateMap.clear()

          if (!anyDirty) {
            setEnrichedFormData(result)
            if (concretePaths.length > 0) onLoadingChangeRef.current?.([])
            break
          }
```

- [ ] **Step 4: Run the full test suite to confirm all tests pass**

```bash
cd /home/claude/projects/rjsf-formulas
bun test
```

Expected: all tests pass across both rjsf-v5 and rjsf-v6 projects. Zero failures.

- [ ] **Step 5: Commit**

```bash
git add src/useAsyncFormulas.ts tests/useAsyncFormulas.test.tsx
git commit -m "fix: suppress stale intermediate result when input arrives during async evaluation"
```
