# Issue 03 — FormulaForm Sync Evaluation Design

## Overview

Implement `FormulaForm`, a drop-in replacement for RJSF's `<Form>` that enriches `formData` with computed field values on every change. This issue covers synchronous evaluators only — async support is added in issue 05.

---

## Component Signature

**File:** `src/FormulaForm.tsx`

```typescript
type FormulaFormProps<T, S extends StrictRJSFSchema, F extends FormContextType> =
  FormProps<T, S, F> & {
    evaluator: (formula: string, context: object) => unknown
    Form?: React.ComponentType<FormProps<T, S, F>>  // default: Form from @rjsf/core
    formulaKey?: string           // default: 'x-formula'
    formulaContextKey?: string    // default: 'x-formula-context'
    maxConvergencePasses?: number // default: 10
    onFormulaError?: (path: (string | number)[], error: Error) => void
  }

function FormulaForm<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any
>(props: FormulaFormProps<T, S, F>): JSX.Element
```

`FormulaFormProps` spreads all standard `FormProps`. The inner `<Form>` receives them unchanged except for `formData` (enriched) and `uiSchema` (merged with read-only entries).

---

## Data Flow and State Model

`FormulaForm` holds no local state. Everything is derived from props via `useMemo`:

```typescript
const formulaFields = useMemo(
  () => analyzeSchema(schema, { formulaKey, formulaContextKey }),
  [schema, formulaKey, formulaContextKey]
)

const enrichedFormData = useMemo(
  () => enrich(formData, formulaFields, evaluator, maxConvergencePasses, onFormulaError),
  [formData, formulaFields, evaluator, maxConvergencePasses]
)

const mergedUiSchema = useMemo(
  () => mergeReadOnly(uiSchema, formulaFields),
  [uiSchema, formulaFields]
)
```

The inner `<Form>` always receives `enrichedFormData` and `mergedUiSchema`. Its `onChange` is intercepted:

```typescript
const handleChange = (rawData) =>
  props.onChange(enrich(rawData, formulaFields, evaluator, maxConvergencePasses, onFormulaError))
```

The parent's `onChange` always receives enriched data.

---

## Mount Behaviour

On mount, `FormulaForm` fires the parent's `onChange` with the enriched `formData`:

```typescript
useEffect(() => {
  // Empty deps: runs once on mount to push initial enriched values to the parent.
  props.onChange(enrichedFormData)
}, [])
```

`enrichedFormData` is already computed via `useMemo` at render time — no extra work happens here.

---

## uiSchema Read-Only Injection

A pure function `mergeReadOnly(uiSchema, formulaFields)` builds the merged uiSchema. It walks each `FormulaField`'s path and sets `"ui:readonly": true` at the correct nested location.

Path segments translate to uiSchema structure as follows:

| Path segment | uiSchema translation |
|---|---|
| `string` | object property key |
| `number` | `items[n]` (array form, for `prefixItems` tuple slot) |
| `ARRAY_INDEX` alone | `items` (object form, applied to all items) |
| `ARRAY_INDEX` alongside integers | `additionalItems` (for items beyond the tuple prefix) |

> **Implementation note:** The `additionalItems` behaviour for the combined case must be verified against RJSF v5 and v6 source during implementation, as handling may differ between versions.

User-supplied `uiSchema` entries are preserved — only computed field entries are added or overridden.

---

## Convergence Loop

```
function enrich(formData, formulaFields, evaluator, maxConvergencePasses, onFormulaError):
  current = formData
  for pass in 1..maxConvergencePasses:
    candidate = applyAllFormulas(current, formulaFields, evaluator, onFormulaError)
    if deepEqual(candidate computed values, current computed values):
      return candidate  // converged
    current = candidate
  // maxConvergencePasses exceeded — report and clear non-converging fields
  for each field that is still changing:
    onFormulaError(field.path, new Error('did not converge'))
    set field to undefined in current
  return current
```

`applyAllFormulas` evaluates every formula field once against the current `formData`, building the context (sibling fields for default mode) and calling `evaluator` synchronously. For fields whose path contains `ARRAY_INDEX`, it iterates over the actual array elements in `formData` and evaluates each with a concrete index — `ARRAY_INDEX` is never passed to `onFormulaError`. All error callbacks receive fully concrete paths (`string | number` only). Errors per field are caught individually — one failing field does not abort the others.

Convergence is detected via **deep equality** on computed values, so object and array formula results are handled correctly.

---

## Error Handling

Two error cases, both handled identically — set the field to `undefined`, call `onFormulaError(path, error)`:

1. **Evaluator throws** — caught per-field inside `applyAllFormulas`, other fields are unaffected
2. **Convergence failure** — after `maxConvergencePasses`, non-converging fields are set to `undefined` and reported

`onFormulaError` is optional. If not supplied, errors are silently swallowed (field set to `undefined` with no callback).

---

## Testing

**File:** `tests/FormulaForm.test.tsx`

Uses React Testing Library to render `FormulaForm` with a minimal RJSF validator. Reuses schema fixtures from `tests/fixtures/schemas.ts`.

Test cases:
- Mount fires parent `onChange` with enriched `formData`
- User edit triggers `onChange` with enriched result
- Computed field is rendered as read-only
- Nested object: computed field at depth > 1 is enriched correctly
- Array items: each element's formula evaluated independently
- Convergence: field referencing another computed field resolves correctly
- Circular dependency: exceeds `maxConvergencePasses`, calls `onFormulaError`, sets field to `undefined`
- Evaluator throws: field set to `undefined`, `onFormulaError` called, other fields unaffected
- Custom `formulaKey` and `formulaContextKey`
- Custom `Form` prop is rendered instead of default
- `uiSchema` user entries preserved alongside injected read-only entries

Tests run against both RJSF v5 and v6 via the Vitest multi-project config.
