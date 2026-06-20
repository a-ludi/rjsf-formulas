# Issue 05: Async Formula Evaluation — Design

## Goal

Widen the `evaluator` API to accept async functions, add debounced evaluation with a per-field state machine, expose loading state via `onLoadingChange`, and keep the existing sync path fully backward-compatible.

## Architecture

Three files change; everything else stays untouched.

| File | Change |
|------|--------|
| `src/enrich.ts` | `evaluator` parameter widens to `(formula, context) => unknown \| Promise<unknown>`; function becomes `async`; convergence loop `await`s each pass |
| `src/useAsyncFormulas.ts` | New hook — owns debounce timer, per-field state machine, loading callbacks, and the sequence of `enrich` calls |
| `src/FormulaForm.tsx` | Drops `useMemo`-based enrichment and mount `useEffect`; delegates to `useAsyncFormulas`; gains `debounceMs` and `onLoadingChange` props |

`analyzeSchema`, `buildContext`, `mergeReadOnly`, and all existing public types are untouched.

## Section 1: Making `enrich` async

The change is minimal:

1. The `evaluator` parameter type widens to `(formula: string, context: object) => unknown | Promise<unknown>`
2. `enrich` (and its inner `applyAllFormulas`) become `async`, returning `Promise<unknown>`
3. Every `evaluator(...)` call is `await`ed

**Parallel execution within a pass:** `applyAllFormulas` does not `await` evaluators sequentially. Instead:

1. **Collect** all `(field, concretePath, context)` tuples synchronously from the current `result` snapshot
2. **Evaluate** all formulas in parallel via `Promise.allSettled`
3. **Apply** all results back to `result` in a single synchronous write loop after settlement

`Promise.allSettled` ensures one failing evaluator does not abort the rest — each rejected promise maps to `onFormulaError` + `undefined`.

**Convergence semantics:** Within a pass, formula B no longer sees formula A's freshly-written value from the same pass. Each pass works from a clean snapshot. This is the standard fixed-point iteration model and is more correct — the convergence loop handles multi-pass stabilization.

**Backward compatibility:** `await syncValue` is a no-op for non-Promises, so existing sync evaluators work unchanged.

## Section 2: `useAsyncFormulas` hook

```typescript
function useAsyncFormulas(
  formData: unknown,
  formulaFields: FormulaField[],
  evaluator: (formula: string, context: object) => unknown | Promise<unknown>,
  debounceMs: number,
  maxConvergencePasses: number,
  onFormulaError: ((path: (string | number)[], error: Error) => void) | undefined,
  onLoadingChange: ((loadingPaths: (string | number)[][]) => void) | undefined,
  contextOptions: BuildContextOptions
): {
  enrichedFormData: unknown
  handleInput: (newFormData: unknown) => void
}
```

**Internals:**

- **`enrichedFormData` state** — `useState`, initialized to `formData`, updated after each completed convergence sequence
- **`pendingInputRef`** — always holds the latest raw `formData` received via `handleInput`
- **`fieldStateRef`** — a `Map` from path-string to `'idle' | 'running' | 'dirty'`, one entry per formula field × concrete path
- **`debounceTimerRef`** — cleared and reset on each `handleInput` call; fires after `debounceMs`
- **`runningPassRef`** — tracks whether a convergence sequence is currently in flight

**Flow:**

1. `handleInput(newFormData)` stores `newFormData` in `pendingInputRef`, resets the debounce timer, and flips any `running` fields to `dirty`
2. When the debounce timer fires, a convergence sequence starts against `pendingInputRef.current`
3. If `handleInput` arrives during the sequence, the debounce timer is reset and in-flight fields are marked `dirty`
4. When the sequence finishes, if any field is `dirty`, a new sequence starts immediately (no extra debounce wait)
5. `enrichedFormData` state is updated after each completed sequence

**External `formData` changes:** The hook also watches the `formData` parameter via `useEffect`. If the parent passes a new `formData` value (controlled component pattern), the hook calls `handleInput(formData)` internally, triggering debounce and evaluation exactly as if the user had edited a field.

**Loading callbacks:** `onLoadingChange` is called whenever field states transition — once with all in-flight paths when a sequence starts, and again with `[]` when all paths return to `idle`.

## Section 3: `FormulaForm` changes

Two new optional props:

```typescript
debounceMs?: number  // default 300
onLoadingChange?: (loadingPaths: (string | number)[][]) => void
```

The `evaluator` prop type widens to accept `Promise<unknown>`.

The `useMemo`-based `enrichedFormData` and the `useEffect` mount-push are removed. Instead:

```typescript
const { enrichedFormData, handleInput } = useAsyncFormulas(
  formData, formulaFields, evaluator, debounceMs,
  maxConvergencePasses, onFormulaError, onLoadingChange, contextOptions
)

const handleChange = (data: IChangeEvent<T, S, F>, id?: string) => {
  handleInput(data.formData)
  onChange?.({ ...data, formData: enrichedFormData }, id)
}
```

**`onChange` timing:** `onChange` fires immediately with the *previous* enriched value while a new evaluation is in flight. Once `useAsyncFormulas` settles, `enrichedFormData` updates via state, triggering a re-render of the inner form with the new values. The parent sees settled values via re-render, not via a second `onChange` event.

## Section 4: Testing

**`tests/enrich.test.ts`** — extend existing tests:
- Async evaluator resolves correctly in a single pass
- Async evaluator is awaited across the convergence loop (multi-pass stabilization)
- Parallel execution within a pass: all evaluators called concurrently
- Sync evaluators still work unchanged (backward compat)

**`tests/useAsyncFormulas.test.ts`** — new file, `renderHook` tests:
- `handleInput` triggers debounce; evaluation fires after `debounceMs`
- Rapid `handleInput` calls coalesce into one evaluation
- In-flight evaluation: second `handleInput` marks fields dirty, re-evaluates after first completes
- `onLoadingChange` called with in-flight paths on start, `[]` on completion
- `onFormulaError` called for rejected evaluators
- Non-converging formulas reported after `maxConvergencePasses`

**`tests/FormulaForm.test.tsx`** — extend existing tests:
- `debounceMs` prop wires through correctly (mock timers)
- `onLoadingChange` fires with correct paths
- `onChange` fires immediately with previous enriched value; re-render delivers settled value

All tests run against both rjsf-v5 and rjsf-v6 projects.
