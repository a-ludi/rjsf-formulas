# `refreshRef` — Explicit Formula Refresh

**Date:** 2026-11-27
**Issue:** [#7 Explicitly refresh formula results](https://github.com/a-ludi/rjsf-formulas/issues/7)

## Motivation

Remounting `<FormulaForm key={k} />` is the only current way to force formula re-evaluation without a `formData` change. It destroys all form state and is too coarse-grained. Issue #7 requests a targeted re-evaluation mechanism that also provides direct feedback when the refresh is finished.

## API surface

One new optional prop on `FormulaFormProps`:

```ts
refreshRef?: React.MutableRefObject<(() => Promise<void>) | null>
```

**Call-site usage:**

```tsx
const refreshRef = useRef<(() => Promise<void>) | null>(null)

<FormulaForm refreshRef={refreshRef} evaluator={...} ... />

// later:
await refreshRef.current?.()
```

`refreshRef.current` is populated on mount and set to `null` on unmount.

The returned `Promise<void>` resolves when evaluation has converged (all formula passes settled). If called while a run is already in progress the promise resolves at the next stable state.

## Internal mechanics

### `useAsyncFormulas` changes

**New ref:**
```ts
const refreshResolversRef = useRef<Array<() => void>>([])
```

**New `forceRerunRef`:**
```ts
const forceRerunRef = useRef(false)
```

**New `refresh` function** (stable `useCallback`, no deps):
```ts
const refresh = useCallback((): Promise<void> => {
  return new Promise(resolve => {
    refreshResolversRef.current.push(resolve)
    if (runningRef.current) forceRerunRef.current = true  // only needed mid-run
    startSequence()                // bypasses debounce; echo-guard irrelevant (not via handleInput)
  })
}, [startSequence])
```

No echo-guard clearing is needed. `refresh()` calls `startSequence` directly — the echo-guard lives inside `handleInput` and is not on this code path.

`forceRerunRef` is needed because `startSequence` has an early-return guard (`if (runningRef.current) return`). Without it, a mid-run `refresh()` call would queue a resolver that resolves when the already-in-flight run finishes — with no fresh evaluation pass. Setting the flag forces the loop to re-iterate at least once after any `refresh()` call.

**`startSequence` — loop break condition and resolver drain:**

The existing `if (!anyDirty) { ... break }` check expands to:
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

Drain resolvers in `finally`:
```ts
} finally {
  runningRef.current = false
  const resolvers = refreshResolversRef.current.splice(0)
  for (const r of resolvers) r()
}
```

This covers both the converged-and-broke path and the unmount-and-broke path.

**Unmount cleanup** — drain any resolvers that were queued after a debounce was cancelled:
```ts
// added to existing cleanup effect
const resolvers = refreshResolversRef.current.splice(0)
for (const r of resolvers) r()
```

**Return value** expands from `{ enrichedFormData, handleInput }` to `{ enrichedFormData, handleInput, refresh }`.

### `FormulaFormImpl` wiring

```ts
useEffect(() => {
  if (!refreshRef) return
  refreshRef.current = refresh
  return () => { refreshRef.current = null }
}, [refresh, refreshRef])
```

## Behaviour details

| Scenario | Behaviour |
|---|---|
| Called when idle | Starts evaluation immediately (no debounce). Promise resolves on convergence. |
| Called mid-run | `forceRerunRef` is set; current run does ≥1 additional pass before resolving. |
| Called with no formula fields | Loop runs one pass with empty `concretePaths`, resolves normally. |
| Component unmounts before resolution | Cleanup drains resolver queue; promise resolves. |
| Called multiple times concurrently | Each call gets its own promise; all resolve together at next stable state. |

## Testing plan

**`tests/useAsyncFormulas.test.tsx`** (hook level):
1. `refresh()` triggers evaluation immediately without waiting for debounce
2. Promise resolves after evaluation settles — sync evaluator
3. Promise resolves after evaluation settles — async evaluator
4. Calling `refresh()` mid-run still resolves the promise
5. Multiple concurrent `refresh()` calls each resolve
6. Promise resolves on unmount (no hanging promises)

**`tests/FormulaForm.test.tsx`** (component level):
7. `refreshRef.current` is populated after mount
8. `refreshRef.current` is `null` after unmount
9. Calling `refreshRef.current()` re-evaluates and resolves

## Out of scope

- Returning the enriched `formData` from the promise (can be read from `onChange` or component state)
- Exporting `useAsyncFormulas` publicly (it remains internal)
- A `refreshKey` prop alternative
