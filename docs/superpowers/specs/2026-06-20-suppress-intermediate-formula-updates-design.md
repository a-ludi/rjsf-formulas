# Suppress Intermediate Formula Updates

## Problem

When an async evaluator is slow and new input arrives during evaluation, `useAsyncFormulas` publishes a stale intermediate result before re-running with the latest input. This causes the computed fields to flicker to an incorrect value briefly, which appears erratic to the user.

Root cause: in the `while(true)` loop in `useAsyncFormulas.ts`, `setEnrichedFormData(result)` is called unconditionally — even when the loop immediately detects `anyDirty` and is about to discard that result and re-run.

## Fix

Move `setEnrichedFormData(result)` inside the `!anyDirty` branch so the result is only published when it is the final, clean output.

```ts
// Before
stateMap.clear()
setEnrichedFormData(result)           // always published — erratic
if (!anyDirty) {
  onLoadingChangeRef.current?.([])
  break
}

// After
stateMap.clear()
if (!anyDirty) {
  setEnrichedFormData(result)         // only published when clean
  onLoadingChangeRef.current?.([])
  break
}
// dirty: discard stale result, loop with pendingInputRef.current
```

## Consequences

- Computed fields retain their previous value while a dirty re-run is in progress, matching the SPEC's existing guarantee ("retains previous computed value while resolving").
- The parent's `onChange` also stops receiving the intermediate stale result, since the `useEffect` in `FormulaForm.tsx` fires on `enrichedFormData` changes.
- `onLoadingChange` is unaffected: it is called with the full path list at the top of each loop iteration, so the loading state stays active across dirty re-runs without interruption.

## Scope

Single change: `src/useAsyncFormulas.ts`, inside the `while(true)` loop in `startSequence`.
