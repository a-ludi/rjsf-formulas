# 02 — Schema analysis

Status: ready-for-agent

## Goal

Implement a pure function that traverses a JSON schema and returns a description of all computed fields — their paths, formula strings, and context modes. This is the foundation that all evaluation code builds on.

## Context

The schema analysis must be memoized in `FormulaForm` (`useMemo` keyed on `schema`) so it does not re-run on every data change, only when the schema itself changes.

## Acceptance criteria

- A function `analyzeSchema(schema, options)` returns an array of `FormulaField` descriptors:
  ```typescript
  type ContextMode = 'siblings' | 'extended'

  type FormulaField = {
    path: (string | number)[]  // location within formData, e.g. ["order", "items", 2, "total"]
    formula: string
    contextMode: ContextMode
  }
  ```
- `options` accepts:
  - `formulaKey: string` — schema key to look for (default `"x-formula"`)
  - `formulaContextKey: string` — schema key for context mode (default `"x-formula-context"`)
- The function recurses through nested objects
- For array schemas (`type: "array"` with `items` of `type: "object"`), the path uses a `number` placeholder (e.g. `NaN` or a sentinel) to indicate "all indices" — the evaluation layer resolves this against actual data at runtime
- `x-formula-context` absent or `"siblings"` → `contextMode: 'siblings'`
- `x-formula-context: "extended"` → `contextMode: 'extended'`
- Unknown `x-formula-context` values are treated as `"siblings"` (with a console warning)
- Fully unit-tested; tests run against both RJSF v5 and v6 (schema shape does not differ between versions, but the test harness confirms it)

## References

See `SPEC.md` — Formula Context and Evaluation sections.
