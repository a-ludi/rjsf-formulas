# Issue 06: Composite Schema Support — Design

## Goal

Extend `analyzeSchema` to recurse into JSON Schema composition operators (`$ref`, `oneOf`, `anyOf`, `allOf` in phase 1; `if/then/else` in phase 2), collecting `FormulaField` descriptors from all relevant branches. Inactive branch formulas are skipped at evaluation time using the same validator RJSF already uses.

## Core concept: conditional formula fields

`FormulaField` gains a `condition` field:

```typescript
type FormulaField = {
  path: (string | number | ArrayIndex)[]
  formula: string
  contextMode: ContextMode
  condition: RJSFSchema | true  // true = always active
}
```

`true` means the field is always active (all fields from normal `properties`/`items` traversal). For composition branches, `condition` is the branch schema verbatim. See `docs/adr/0001-formula-field-condition-type.md` for why `true` rather than `undefined` or `{}`.

**Nested conditions** compose as an `allOf` conjunction. A field discovered inside `outer_oneOf[0]` → `inner_oneOf[1]` gets `{ allOf: [outer_branch, inner_branch] }`. `true` entries are omitted; a single-entry array is unwrapped to the schema directly.

## Phase 1: `$ref`, `oneOf`, `anyOf`, `allOf`

### `$ref`

Resolved using `findSchemaDefinition($ref, schema)` exported from `@rjsf/utils` — the same function RJSF uses internally. This handles in-document refs (`#/definitions/Foo`, anchors) synchronously. External document refs throw, matching RJSF's own behavior.

`analyzeSchema` is always called with the root schema, so `schema === rootSchema` for `findSchemaDefinition` purposes. No new resolver parameter is added.

### `allOf`

All branches are always active, so each branch is traversed with `condition: true` (which composes into the ambient condition from any enclosing composition operators). Conflicts (same path, multiple formulas across branches) are detected at analysis time and handled according to `formulaConflictBehavior`.

### `oneOf` / `anyOf`

Each branch is traversed with `condition: branchSchema`. Which branches are active is only known at evaluation time, so conflicts across active branches are detected in `enrich`, not in `analyzeSchema`.

### Conflict handling

A new option `formulaConflictBehavior: 'ignore' | 'warn' | 'error'` (default `'warn'`) controls what happens when the same path has multiple active formulas:

| Value | Behaviour |
|-------|-----------|
| `'ignore'` | Silently take the last formula |
| `'warn'` | `console.warn`, then take the last formula |
| `'error'` | Throw synchronously — intended as a developer tool for aggressive schema validation |

Conflicts are only flagged when they actually occur (i.e. multiple branches are simultaneously active with overlapping paths). Having formulas for the same path across mutually exclusive branches is fine.

A path that carries a formula in any branch is always rendered read-only by `mergeReadOnly` — the same field being both user-editable and computed across branches is considered a schema authoring error.

## Phase 2: `if/then/else`

Fields inside `then` get `condition: ifSchema`. Fields inside `else` get `condition: { "not": ifSchema }`. The `{ "not": ... }` wrapper means the same `validator.isValid(condition, formData, rootSchema)` call handles both branches uniformly.

Fields inside the `if` schema itself are warned about and not collected — RJSF strips the `if` keyword before rendering (confirmed by reading `resolveCondition` in `@rjsf/utils`), so any formula there has no rendered UI target.

## Files changed

| File | Change |
|------|--------|
| `src/analyzeSchema.ts` | Recurse into `$ref`, `allOf`, `oneOf`, `anyOf` (phase 1); `then`/`else` (phase 2); warn on formulas in `if`; accept `formulaConflictBehavior` option; `FormulaField.condition` added |
| `src/enrich.ts` | Accept required `checkCondition` and `formulaConflictBehavior` parameters; skip fields whose condition is false; detect and handle runtime conflicts |
| `src/useAsyncFormulas.ts` | Accept required `checkCondition` (stored in a ref); pass `formulaConflictBehavior` through to `enrich` |
| `src/FormulaForm.tsx` | Extract `validator` explicitly from props; build `checkCondition` closure; add `formulaConflictBehavior` prop; pass both to `useAsyncFormulas` |
| `src/mergeReadOnly.ts` | Unchanged |
| `src/buildContext.ts` | Unchanged |

## Key interfaces

### `checkCondition` closure (built in `FormulaForm`)

```typescript
const checkCondition = useCallback(
  (condition: RJSFSchema, formData: unknown) =>
    validator.isValid(condition, formData, schema),
  [validator, schema]
)
```

Call signature matches RJSF exactly: `validator.isValid(schema, formData, rootSchema)` (confirmed from `@rjsf/utils` source).

### `analyzeSchema` new option

```typescript
type AnalyzeSchemaOptions = {
  formulaKey?: string
  formulaContextKey?: string
  formulaConflictBehavior?: 'ignore' | 'warn' | 'error'  // default 'warn'
}
```

### `enrich` new parameters

```typescript
async function enrich(
  formData: unknown,
  fields: FormulaField[],
  evaluator: ...,
  maxPasses: number,
  onFormulaError: ...,
  formulaDataKey: string,
  formulaPathKey: string,
  checkCondition: (condition: RJSFSchema, formData: unknown) => boolean,  // new, required
  formulaConflictBehavior: 'ignore' | 'warn' | 'error',                  // new
): Promise<unknown>
```

### `useAsyncFormulas` new parameters

```typescript
function useAsyncFormulas(
  formData: unknown,
  formulaFields: FormulaField[],
  evaluator: ...,
  debounceMs: number,
  maxConvergencePasses: number,
  onFormulaError: ...,
  onLoadingChange: ...,
  contextOptions: BuildContextOptions,
  checkCondition: (condition: RJSFSchema, formData: unknown) => boolean,  // new, required
  formulaConflictBehavior: 'ignore' | 'warn' | 'error',                  // new
): { enrichedFormData: unknown; handleInput: (newFormData: unknown) => void }
```

### `FormulaForm` new prop

```typescript
formulaConflictBehavior?: 'ignore' | 'warn' | 'error'  // default 'warn'
```

`validator` is extracted from props explicitly (no longer in `...rest`) to build the `checkCondition` closure.

## Evaluation-time behaviour for inactive fields

When a field's condition evaluates to false, `enrich` skips it entirely — the field's current value in `formData` is left unchanged. Managing stale branch data is RJSF's responsibility.

## Testing

**`tests/analyzeSchema.test.ts`** — extend existing tests:

- `$ref` is resolved and formula fields inside the referenced schema are collected
- `allOf`: formulas from all branches collected; conflict detection fires for colliding paths
- `oneOf` / `anyOf`: formulas from all branches collected with correct branch schema as condition
- Nested composition: conditions compose correctly as `allOf` conjunctions
- Phase 2: `then` fields carry `if` schema as condition; `else` fields carry `{ "not": ifSchema }`
- Phase 2: formula inside `if` schema emits `console.warn` and is not collected

**`tests/enrich.test.ts`** — extend existing tests:

- Field with `condition: true` always evaluated (backward compat)
- Field with failing condition is skipped; value left unchanged
- Runtime conflict across active `anyOf` branches: all three `formulaConflictBehavior` modes
- `error` mode throws synchronously

**`tests/FormulaForm.test.tsx`** — extend existing tests:

- `formulaConflictBehavior` prop wires through to `enrich`
- `checkCondition` uses `validator.isValid` with correct rootSchema
