# Issue 04 — Extended Formula Context Design

## Overview

Implement the `"extended"` context mode for `FormulaForm`. When a field declares `x-formula-context: "extended"`, the evaluator receives not just sibling fields but also the full `formData` and the field's own path, injected under configurable keys.

---

## Architecture

One new file, two modified files:

| File | Change |
|---|---|
| `src/buildContext.ts` | New — pure function that constructs the evaluator context for any context mode |
| `src/evaluate.ts` | Modified — replace inline sibling-context construction with a `buildContext` call |
| `src/FormulaForm.tsx` | Modified — add `formulaDataKey` / `formulaPathKey` props, thread through to `buildContext` |

---

## `buildContext` Function

**File:** `src/buildContext.ts`

```typescript
type BuildContextOptions = {
  formulaDataKey: string  // default: '__formData__'
  formulaPathKey: string  // default: '__path__'
}

function buildContext(
  field: FormulaField,
  resolvedPath: (string | number)[],
  candidateFormData: unknown,
  options: BuildContextOptions
): object
```

### Behavior

1. Navigate `candidateFormData` to the parent using `resolvedPath.slice(0, -1)` to extract sibling fields.
2. For `contextMode: 'siblings'`: return `{ ...siblings }`.
3. For `contextMode: 'extended'`: return `{ ...siblings, [options.formulaDataKey]: candidateFormData, [options.formulaPathKey]: resolvedPath }`.

### Key invariants

- `resolvedPath` always contains concrete indices (`string | number`) — the `ARRAY_INDEX` sentinel is substituted by the evaluation loop before calling `buildContext`, consistent with how it already handles array iteration.
- `candidateFormData` is the current convergence-pass candidate (partially enriched), not the raw incoming `formData`. This means `__formData__` reflects the most recently computed values of other formula fields in the same pass.

---

## `FormulaFormProps` Changes

**File:** `src/FormulaForm.tsx`

Two new optional props added to `FormulaFormProps`:

```typescript
type FormulaFormProps<T, S extends StrictRJSFSchema, F extends FormContextType> =
  FormProps<T, S, F> & {
    evaluator: (formula: string, context: object) => unknown
    Form?: React.ComponentType<FormProps<T, S, F>>
    formulaKey?: string            // default: 'x-formula'
    formulaContextKey?: string     // default: 'x-formula-context'
    formulaDataKey?: string        // NEW — default: '__formData__'
    formulaPathKey?: string        // NEW — default: '__path__'
    maxConvergencePasses?: number  // default: 10
    onFormulaError?: (path: (string | number)[], error: Error) => void
  }
```

Both props are threaded through to `buildContext` via the `evaluate` call chain.

---

## Changes to `evaluate.ts`

The `applyAllFormulas` function currently builds context inline:

```typescript
// before (issue 03)
const context = { ...siblings }
```

This is replaced with:

```typescript
// after (issue 04)
const context = buildContext(field, resolvedPath, candidateFormData, {
  formulaDataKey,
  formulaPathKey,
})
```

`buildContext` uses `field.contextMode` to select the mode; `resolvedPath` is the concrete path already constructed by the array iteration logic.


No changes to the convergence loop, error handling, or array iteration logic.

---

## Testing

### New: `tests/buildContext.test.ts`

Unit tests for `buildContext` in isolation:

- `siblings` mode returns only sibling fields (no extra keys)
- `extended` mode includes siblings, `__formData__`, and `__path__`
- Custom `formulaDataKey` is used as the injection key instead of `__formData__`
- Custom `formulaPathKey` is used as the injection key instead of `__path__`
- `__path__` reflects a concrete array index (e.g. `["items", 1, "total"]`), not the `ARRAY_INDEX` sentinel
- `__formData__` is the full `candidateFormData` object passed in (not a copy of siblings)

### Modified: `tests/FormulaForm.test.tsx`

Integration tests added:

- Extended context: a formula references a field outside its immediate siblings via `__formData__` and produces the correct result
- Custom `formulaDataKey` prop flows through to the evaluator context
- Custom `formulaPathKey` prop flows through to the evaluator context

All tests run against both RJSF v5 and v6 via the Vitest multi-project config.
