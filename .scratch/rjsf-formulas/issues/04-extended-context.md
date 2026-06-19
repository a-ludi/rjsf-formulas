# 04 — Extended formula context

Status: ready-for-agent

## Depends on

- 03 (sync evaluation)

## Goal

Implement the `"extended"` context mode: sibling fields plus `__formData__` and `__path__` injected into the same context object.

## Acceptance criteria

- When a field has `x-formula-context: "extended"`, the context passed to the evaluator is:
  ```typescript
  {
    // all sibling fields (same as default/siblings context)
    ...siblings,

    // injected extensions
    [formulaDataKey]: formData,         // full form data
    [formulaPathKey]: (string|number)[] // path to this computed field
  }
  ```
- `FormulaFormProps` includes:
  ```typescript
  formulaDataKey?: string  // default: "__formData__"
  formulaPathKey?: string  // default: "__path__"
  ```
- `formulaDataKey` and `formulaPathKey` are configurable to avoid collisions with sibling field names
- `x-formula-context: "siblings"` (or absent) continues to pass only sibling fields — no injection
- The `__path__` value uses strings for object keys and numbers for array indices, matching the path representation from schema analysis

### Tests

- Unit tests covering:
  - extended context includes siblings alongside `__formData__` and `__path__`
  - custom `formulaDataKey` / `formulaPathKey` are respected
  - `__path__` correctly reflects the field's location, including array indices
- Tests run against both RJSF v5 and v6

## References

See `SPEC.md` — Formula Context section.
