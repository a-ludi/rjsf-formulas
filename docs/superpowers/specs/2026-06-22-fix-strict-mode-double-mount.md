# Fix: React StrictMode Double-Mount Breaks Formula Evaluation — Design

## Goal

Fix `useAsyncFormulas` so that `FormulaForm` correctly evaluates formulas and calls `onChange` with enriched data when the host application wraps its tree in `<React.StrictMode>`.

## Background

React 18's `<StrictMode>` intentionally double-invokes effects in development to surface bugs tied to mount/unmount assumptions. Concretely, after the first effects run, React immediately runs all cleanup functions (simulating an unmount), then runs all effects again (simulating a remount). The component is never actually removed from the DOM; only the effect lifecycle is replayed. Critically, `useRef` values **persist** across this cycle — React reuses the same component instance.

## Root Cause

`useAsyncFormulas` uses two refs as "lifecycle sentinels", but neither is reset when the simulated remount occurs:

### `isUnmountedRef`

The cleanup effect (empty-dep `useEffect`) sets `isUnmountedRef.current = true` in its cleanup function to prevent stale async results from updating state after unmount. This is correct — but there is no corresponding reset to `false` on remount.

In StrictMode, the sequence is:

1. **First effects run** — `isUnmountedRef.current` starts as `false` (default); cleanup effect setup runs (no-op at this point)
2. **Simulated unmount** — cleanup effect cleanup runs: `isUnmountedRef.current = true`, debounce timer cancelled
3. **Second effects run** — `isUnmountedRef.current` is still `true`; no code resets it

Inside `startSequence`, after `enrich` resolves:

```ts
if (isUnmountedRef.current) break
```

Because `isUnmountedRef.current` is permanently `true`, the sequence always breaks before calling `setEnrichedFormData`. The state never updates. `onChange` is never called with enriched data.

### `hasMountedRef`

The no-dependency effect (which reacts to every render) uses `hasMountedRef` to distinguish the first mount from subsequent renders:

```ts
if (!hasMountedRef.current) {
  hasMountedRef.current = true
  lastExternalFormDataRef.current = formData
  handleInput(formData)
} else if (!deepEqual(formData, lastExternalFormDataRef.current)) {
  ...
}
```

On the first effects run, `hasMountedRef.current` is set to `true` and `handleInput` is called. After the simulated unmount+remount, `hasMountedRef.current` remains `true`, so the second effects run takes the `else` branch. `lastExternalFormDataRef.current` still holds the same value as `formData` (unchanged since first mount), so `deepEqual` returns `true` — **`handleInput` is never called** on the second mount.

The debounce timer was also cancelled in the simulated unmount. Combined, no new evaluation is ever triggered.

## Fix

The existing empty-dep cleanup effect is expanded to reset both sentinels at the right moments:

**In the setup function (runs on mount/remount):**

```ts
isUnmountedRef.current = false
```

This resets the "mounted" guard before any debounce can fire, so `startSequence` does not break early.

**In the cleanup function (runs on unmount):**

```ts
hasMountedRef.current = false
```

This ensures the no-dep effect treats the next mount as a fresh mount, calling `handleInput(formData)` unconditionally and restarting the debounce.

**Ordering is safe.** Effects run in declaration order. The no-dep effect (declared first) runs before the cleanup effect (declared last). So in the second StrictMode cycle:

1. No-dep effect: `hasMountedRef.current = false` → if-branch → `handleInput(formData)` called, debounce started; `isUnmountedRef.current` is still `true` at this instant
2. Cleanup effect setup: `isUnmountedRef.current = false`

The debounce fires asynchronously (macrotask), well after step 2. By then `isUnmountedRef.current = false`, so `startSequence` proceeds normally.

**Full diff for `src/useAsyncFormulas.ts`:**

```diff
-  // Cleanup debounce on unmount
-  useEffect(
-    () => () => {
-      isUnmountedRef.current = true
-      if (debounceTimerRef.current !== null) clearTimeout(debounceTimerRef.current)
-    },
-    []
-  )
+  // Reset lifecycle sentinels on every (re)mount; clean up on unmount.
+  // The setup body runs before any debounce fires, so isUnmountedRef is false
+  // by the time startSequence checks it.
+  useEffect(() => {
+    isUnmountedRef.current = false
+    return () => {
+      isUnmountedRef.current = true
+      hasMountedRef.current = false  // allow re-init on next mount (React StrictMode)
+      if (debounceTimerRef.current !== null) clearTimeout(debounceTimerRef.current)
+    }
+  }, [])
```

No other files need to change.

## Regression Tests

Two new tests in `tests/useAsyncFormulas.test.tsx`, grouped in a new `describe` block:

```
describe('useAsyncFormulas — React StrictMode compatibility')
```

### Test 1: enriches formData after debounce in StrictMode

Wraps `renderHook` in `React.StrictMode`. After advancing fake timers past `debounceMs`, asserts that `enrichedFormData` contains the computed value.

```tsx
it('enriches formData after debounce when rendered inside React.StrictMode', async () => {
  vi.useFakeTimers()
  const fields = [field(['total'], 'price * quantity')]
  const { result } = renderHook(
    () => useAsyncFormulas(
      { price: 2, quantity: 3, total: 0 },
      fields, evalSimple, 300, 10, undefined, undefined, ctxOpts
    ),
    { wrapper: ({ children }) => <React.StrictMode>{children}</React.StrictMode> }
  )
  await act(async () => { await vi.advanceTimersByTimeAsync(300) })
  expect((result.current.enrichedFormData as any).total).toBe(6)
})
```

### Test 2: does not publish stale result after unmount+remount

Verifies the `isUnmountedRef` reset: unmounts manually (real unmount, not StrictMode), then remounts, and confirms enriched data is correct after the second mount's evaluation completes.

```tsx
it('enriches formData correctly after unmount and remount', async () => {
  vi.useFakeTimers()
  const fields = [field(['total'], 'price * quantity')]

  const { result, unmount, rerender } = renderHook(
    () => useAsyncFormulas(
      { price: 2, quantity: 3, total: 0 },
      fields, evalSimple, 300, 10, undefined, undefined, ctxOpts
    )
  )
  await act(async () => { await vi.advanceTimersByTimeAsync(300) })
  expect((result.current.enrichedFormData as any).total).toBe(6)

  unmount()

  const { result: result2 } = renderHook(
    () => useAsyncFormulas(
      { price: 5, quantity: 4, total: 0 },
      fields, evalSimple, 300, 10, undefined, undefined, ctxOpts
    )
  )
  await act(async () => { await vi.advanceTimersByTimeAsync(300) })
  expect((result2.current.enrichedFormData as any).total).toBe(20)
})
```

A parallel StrictMode test at the `FormulaForm` level in `tests/FormulaForm.test.tsx` verifies the end-to-end `onChange` flow:

```
describe('FormulaForm — React StrictMode compatibility')
```

### Test 3: FormulaForm calls onChange with enriched data in StrictMode

```tsx
it('calls onChange with enriched formData after initial evaluation in StrictMode', async () => {
  vi.useFakeTimers()
  const onChange = vi.fn()
  render(
    <React.StrictMode>
      <FormulaForm
        schema={basic.schema as any}
        formData={basic.formData as any}
        validator={validator}
        evaluator={evalSimple}
        onChange={onChange}
        Form={vi.fn(() => <div />) as any}
      />
    </React.StrictMode>
  )
  await act(async () => { await vi.advanceTimersByTimeAsync(300) })
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({ formData: { price: 10, quantity: 3, total: 30 } }),
    undefined
  )
})
```

## CHANGELOG

Add to the `[Unreleased]` section:

```markdown
### Fixed
- Formula evaluation silently fails in apps using `<React.StrictMode>`: computed values are
  never applied and `onChange` is never called with enriched data. Root cause: two lifecycle
  refs (`isUnmountedRef`, `hasMountedRef`) were not reset on remount, causing the evaluation
  sequence to exit early after StrictMode's simulated unmount+remount cycle.
```

## Test Run

```bash
bun run test
```

All projects must pass (`rjsf-v6`, `rjsf-v6-react`, `rjsf-v5`, `rjsf-v5-react`). The new StrictMode tests must be among the passing tests.
