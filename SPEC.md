# rjsf-formulas — Specification

## Overview

`rjsf-formulas` is a React library that extends [RJSF](https://github.com/rjsf-team/react-jsonschema-form) with computed fields. Fields marked with a formula key in the JSON schema are evaluated automatically on every data change — the user cannot edit them directly.

---

## API

### `<FormulaForm>`

A drop-in replacement for RJSF's `<Form>`. Accepts all standard RJSF `FormProps` plus the formula-specific props below.

```typescript
function FormulaForm<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any
>(props: FormulaFormProps<T, S, F>): JSX.Element
```

```typescript
type Evaluator = (
  formula: string,
  context: object
) => unknown | Promise<unknown>

type FormulaFormProps<T, S extends StrictRJSFSchema, F extends FormContextType> =
  FormProps<T, S, F> & {
    // Required
    evaluator: Evaluator

    // Inner form component (default: Form from @rjsf/core)
    Form?: React.ComponentType<FormProps<T, S, F>>

    // Schema keys (configurable)
    formulaKey?: string           // default: "x-formula"
    formulaContextKey?: string    // default: "x-formula-context"

    // Extended context injection keys (configurable)
    formulaDataKey?: string       // default: "__formData__"
    formulaPathKey?: string       // default: "__path__"

    // Evaluation tuning
    maxConvergencePasses?: number // default: 10
    debounceMs?: number           // default: 300

    // Callbacks
    onFormulaError?: (path: (string | number)[], error: Error) => void
    onLoadingChange?: (loadingPaths: (string | number)[][]) => void
  }
```

### Schema syntax

Mark a field as computed by adding `formulaKey` (default `x-formula`) to its schema entry:

```json
{
  "type": "object",
  "properties": {
    "price":    { "type": "number" },
    "quantity": { "type": "number" },
    "total": {
      "type": "number",
      "x-formula": "price * quantity"
    }
  }
}
```

---

## Formula Context

### Default context (siblings)

When `x-formula-context` is absent or set to `"siblings"`, the formula receives the **sibling fields** of the computed field as its context object.

```
formula: "price * quantity"
context: { price: 10, quantity: 3, total: <previous value> }
```

Passing `"siblings"` explicitly is equivalent to omitting the key and exists to allow schemas to be self-documenting about their intent.

### Extended context

When `x-formula-context: "extended"` is set, the formula receives the **sibling fields plus two additional properties** injected into the same context object: the full `formData` and the path to the computed field.

```json
"total": {
  "type": "number",
  "x-formula": "price * quantity + __formData__.tax",
  "x-formula-context": "extended"
}
```

```typescript
// context shape in extended mode
{
  // sibling fields (same as default context)
  price: 10,
  quantity: 3,
  total: <previous value>,

  // injected extensions
  __formData__: T,               // full form data (key configurable via formulaDataKey)
  __path__: (string | number)[]  // e.g. ["order", "items", 2, "total"] (key configurable via formulaPathKey)
}
```

The `__path__` array uses strings for object keys and numbers for array indices, enabling precise relative references within the formula. The injection keys default to `__formData__` and `__path__` and can be changed via `formulaDataKey` and `formulaPathKey` props to avoid collisions with sibling field names.

### Summary of valid context values

| `x-formula-context` value | Behaviour |
|---|---|
| absent | sibling fields (default) |
| `"siblings"` | sibling fields (explicit) |
| `"extended"` | `{ formData, path }` |

---

## Data Flow

`FormulaForm` is a transparent transformation layer between the parent and the inner RJSF `<Form>`.

```
parent formData (raw)
        ↓
[FormulaForm enriches with computed values]
        ↓
inner <Form> always sees up-to-date computed values

inner <Form> onChange (raw user edit)
        ↓
[FormulaForm re-evaluates formulas, enriches]
        ↓
parent onChange receives enriched formData
```

The parent remains the source of truth. `FormulaForm` does not own state — it transforms data in both directions.

### Mount behaviour

On mount, `FormulaForm` always recomputes all formula fields (ignoring any saved values in the initial `formData`) and immediately fires the parent's `onChange` with the enriched result. The formula is always authoritative.

### Read-only injection

`FormulaForm` automatically merges `ui:readonly: true` into the `uiSchema` for every computed field. User-supplied `uiSchema` entries are preserved; computed-field entries are added or overridden.

---

## Evaluation

### Schema analysis

On mount (and whenever the `schema` prop changes), `FormulaForm` traverses the schema tree once to locate all computed fields and record their paths, formula strings, and context modes. This analysis is memoized — it does not re-run on data changes, only when the schema itself changes (`useMemo` keyed on `schema`).

All subsequent data-change cycles work from the memoized analysis result, not the raw schema.

### Nested objects and arrays

The schema analysis recurses through nested objects. For array fields, the analysis records that formulas must be applied per element; at evaluation time the wrapper iterates over the actual data array and evaluates each element's formulas independently using that element's own sibling values as the default context.

### Convergence loop

Because computed fields may reference other computed fields — and the evaluator is opaque, so dependency order cannot be determined statically — the wrapper uses a convergence loop:

1. Evaluate all formula fields once, producing a candidate `formData`.
2. Evaluate all formula fields again against the candidate.
3. If no computed value changed, the result has converged — done.
4. If values are still changing, repeat from step 2.
5. If `maxConvergencePasses` is reached without convergence, call `onFormulaError` for each non-converging field with a "did not converge" error, and leave those fields at their previous values.

This also handles circular dependencies: they never converge and are surfaced via `onFormulaError`.

### Async evaluation

The `evaluator` function may return a `Promise`. Each computed field has an independent evaluation state machine:

```
idle
  → change arrives → [debounce] → start evaluation → running
running
  → change arrives during evaluation → running+dirty
  → evaluation finishes → idle
running+dirty
  → change arrives → running+dirty  (no-op, already queued)
  → evaluation finishes → start new evaluation → running
```

This guarantees no concurrent evaluations per field, no stale final state, and at most one queued re-evaluation at any time.

**While a field is resolving**, it retains its previous computed value. `onLoadingChange` is called with the list of field paths currently in `running` or `running+dirty` state whenever that set changes, allowing the host application to show loading indicators.

---

## Error Handling

When formula evaluation throws (including "did not converge" for circular dependencies):

- The field is set to `undefined`, making the invalid state visible rather than silently showing a stale value.
- `onFormulaError(path, error)` is called with the field's path and the thrown error.

The host application decides how to surface errors (toast, inline message, logging, etc.). Note that loading state (async evaluation in progress) is distinct from error state — a field retains its previous value while resolving, and is only set to `undefined` if resolution ultimately fails.

---

## Nested Arrays — Example

```json
{
  "type": "object",
  "properties": {
    "items": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "price":    { "type": "number" },
          "quantity": { "type": "number" },
          "total":    { "type": "number", "x-formula": "price * quantity" }
        }
      }
    }
  }
}
```

Given `formData.items = [{ price: 10, quantity: 2 }, { price: 5, quantity: 4 }]`, the wrapper evaluates `price * quantity` independently for each element, producing:

```json
[
  { "price": 10, "quantity": 2, "total": 20 },
  { "price": 5,  "quantity": 4, "total": 20 }
]
```

---

## Composite Schema Support

Schema composition operators (`$ref`, `oneOf`, `anyOf`, `allOf`) are **not supported in v1**. `analyzeSchema` skips these nodes and emits a `console.warn` when it encounters them.

Support is planned for a future release (issue 06). The key considerations are:

- **`oneOf` / `anyOf` / `allOf`**: Recurse into all branches and collect formula descriptors from each. The evaluation layer already works against live `formData`, so which branch is active is handled naturally.
- **`$ref`**: Requires a resolver. Adding support will introduce an optional `resolver` parameter to `analyzeSchema` — this must be designed to remain non-breaking for callers that do not use `$ref`.

---

## Tooling

| Concern | Choice |
|---|---|
| Build | Vite (library mode), dual ESM + CJS output |
| Types | TypeScript, separate `.d.mts` and `.d.cts` declarations |
| Tests | Vitest |
| Linting | publint (enforces correct dual-package distribution) |
| Git hooks | husky |
| Peer deps | `@rjsf/core >=5`, `@rjsf/utils >=5`, `react >=17` |

### Dual ESM + CJS

Vite's `build.lib.formats` produces both `es` and `cjs` outputs. The `package.json` `exports` field exposes them via conditional exports:

```json
{
  "exports": {
    "import": "./dist/index.mjs",
    "require": "./dist/index.cjs"
  },
  "types": "./dist/index.d.ts"
}
```

### publint

`publint` validates the published package against distribution best practices (correct export conditions, declaration file pairing, no dual-package hazard). It runs:

- **Pre-publish** via a husky pre-push hook (or `prepublishOnly` npm script)
- **CI** as a dedicated step after the build

### Multi-version testing

Both RJSF v5 and v6 are installed simultaneously via npm package aliases and exercised by two Vitest projects sharing the same test suite:

```json
// package.json (devDependencies excerpt)
"@rjsf/core": "^6",
"@rjsf/utils": "^6",
"rjsf-core-v5": "npm:@rjsf/core@^5",
"rjsf-utils-v5": "npm:@rjsf/utils@^5"
```

```typescript
// vitest.config.ts (outline)
projects: [
  { test: { name: 'rjsf-v6', include: ['tests/**/*.test.ts'] } },
  {
    test: {
      name: 'rjsf-v5',
      include: ['tests/**/*.test.ts'],
      resolve: {
        alias: {
          '@rjsf/core':  'rjsf-core-v5',
          '@rjsf/utils': 'rjsf-utils-v5',
        }
      }
    }
  }
]
```

`npm test` runs the full suite against both versions in a single command.
