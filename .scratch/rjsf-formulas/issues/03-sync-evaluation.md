# 03 — FormulaForm: sync evaluation

Status: ready-for-agent

## Depends on

- 01 (project scaffolding)
- 02 (schema analysis)

## Goal

Implement the full `FormulaForm` component for synchronous evaluators. This is the core of the library.

## Acceptance criteria

### Component signature

```typescript
function FormulaForm<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any
>(props: FormulaFormProps<T, S, F>): JSX.Element
```

```typescript
type FormulaFormProps<T, S extends StrictRJSFSchema, F extends FormContextType> =
  FormProps<T, S, F> & {
    evaluator: (formula: string, context: object) => unknown
    Form?: React.ComponentType<FormProps<T, S, F>>  // default: Form from @rjsf/core
    formulaKey?: string
    formulaContextKey?: string
    maxConvergencePasses?: number  // default: 10
    onFormulaError?: (path: (string | number)[], error: Error) => void
  }
```

### Data flow (Option B+)

- The wrapper intercepts `onChange` from the inner Form
- After each user edit it enriches `formData` with computed values and:
  1. Passes the enriched `formData` to the inner `<Form>` immediately (user sees it)
  2. Calls the parent's `onChange` with the enriched result

### Mount behaviour

- On mount, always recomputes all formula fields (ignoring any existing values in `formData`)
- Immediately fires the parent's `onChange` with the enriched result

### Read-only injection

- Merges `ui:readonly: true` into `uiSchema` for every computed field path
- Preserves all user-supplied `uiSchema` entries

### Convergence loop (sync)

1. Evaluate all formula fields against current `formData`, producing a candidate
2. Re-evaluate against the candidate
3. If no computed value changed → converged, done
4. If still changing → repeat from step 2
5. If `maxConvergencePasses` exceeded → call `onFormulaError` for each non-converging field with a "did not converge" error and set those fields to `undefined`

### Error handling

- On evaluation error: set the field to `undefined`; call `onFormulaError(path, error)`
- On convergence failure: same as above with a descriptive error

### Schema analysis

- Schema is analysed once per schema change via `useMemo` (calls `analyzeSchema` from issue 02)

### Custom Form prop

- If `Form` prop is supplied, render it as the inner form instead of `@rjsf/core`'s `Form`
- All `FormProps` pass through unchanged

### Tests

- Unit tests for the convergence loop, error paths, read-only injection, and mount behaviour
- Tests run against both RJSF v5 and v6

## References

See `SPEC.md` — API, Data Flow, Evaluation, and Error Handling sections.
