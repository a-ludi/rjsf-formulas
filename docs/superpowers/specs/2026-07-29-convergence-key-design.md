# Design: `convergenceKey` prop

**Date:** 2026-07-29
**Status:** Approved

## Problem

A user reported a formula that returns a compound value containing a timestamp computed at evaluation time, e.g.:

```json
{ "result": { "x-formula": "{value: price * quantity, timestamp: Date.now()}" } }
```

Because `Date.now()` returns a new value on every call, the computed output differs between every convergence pass. The `allConverged` check — which uses `deepEqual` on the full computed value — never returns `true`, so the loop always hits `maxConvergencePasses` and calls `onFormulaError` with a "did not converge" error.

## Solution

Add a `convergenceKey` prop to `FormulaForm` that lets users project each computed value to a comparable key. The convergence check uses `deepEqual` on the keys rather than the raw values. Non-deterministic sub-fields (like timestamps) can be stripped from the key; the deterministic parts still govern convergence.

## API

```typescript
type FormulaFormProps<...> = FormProps<...> & {
  // ...existing props...

  /**
   * Extracts a comparable key from a computed field value for convergence checking.
   * Two values are considered converged when their keys are deeply equal.
   * Defaults to the identity function — full deep equality of the computed value.
   *
   * Useful when a formula returns a compound value that includes non-deterministic
   * parts (e.g. a timestamp) that should not prevent convergence.
   *
   * @param value - The computed field's value from a convergence pass.
   * @param path  - The concrete path of the computed field.
   * @returns The value to use for convergence comparison.
   */
  convergenceKey?: (value: unknown, path: (string | number)[]) => unknown
}
```

**Default:** `v => v` — identity, preserving current deep-equality behavior exactly.

**Called:** once per computed field per convergence comparison (both in `allConverged` and in the non-convergence detection block at the end of `enrich`).

**Usage example:**

```tsx
<FormulaForm
  convergenceKey={(value, path) =>
    path.at(-1) === 'result' ? (value as any)?.value : value
  }
  evaluator={evaluator}
  schema={schema}
  validator={validator}
/>
```

## Convergence check change

Before (in `allConverged` and non-convergence detection):

```typescript
deepEqual(getAt(prev, concretePath), getAt(next, concretePath))
```

After:

```typescript
deepEqual(
  convergenceKey(getAt(prev, concretePath), concretePath),
  convergenceKey(getAt(next, concretePath), concretePath)
)
```

## Files changed

| File | Change |
|---|---|
| `src/enrich.ts` | `allConverged` and `enrich` gain `convergenceKey` param; both equality checks apply it |
| `src/useAsyncFormulas.ts` | `convergenceKey` added as parameter, stored in a ref, passed to `enrich` |
| `src/FormulaForm.tsx` | `convergenceKey` added to `FormulaFormProps` with JSDoc; destructured with default `v => v`; passed to `useAsyncFormulas` |
| `SPEC.md` | New prop documented in `FormulaFormProps` table |
| `CHANGELOG.md` | Added under `[Unreleased]` |
| `tests/` | New tests (see below) |

## Tests

1. **Default behavior unchanged** — existing test suite passes without modification; omitting `convergenceKey` is equivalent to `v => v`.
2. **Compound value with timestamp converges** — formula returns `{value: price * quantity, timestamp: Date.now()}`; `convergenceKey` extracts `value`; assert convergence reached and no `onFormulaError` called.
3. **Chains still propagate** — `result` depends on a computed `total`; `convergenceKey` set; assert `result` re-evaluates correctly when `total` changes, settling in the expected number of passes.
4. **Genuine circular deps still error** — circular formula dependency with `convergenceKey` set; assert `onFormulaError` still fires after `maxConvergencePasses`.

## Deferred

**C1 (`convergenceEqual`)** — a full equality predicate `(prev, next, path) => boolean` — covers cases where projection to a key is insufficient (e.g. tolerance-based numeric comparison). Not implemented now; can be added as a separate prop without conflicting with `convergenceKey`.
