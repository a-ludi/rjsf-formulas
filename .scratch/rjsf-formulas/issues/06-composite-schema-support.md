# 06 — Composite schema support

Status: ready-for-agent

## Depends on

- 02 (schema analysis)

## Goal

Extend `analyzeSchema` to recurse into JSON Schema composition operators: `$ref`, `oneOf`, `anyOf`, and `allOf`. Currently these nodes are skipped with a `console.warn` (see issue 02).

## Background

Composite schemas are common in real-world RJSF usage. Issue 02 explicitly deferred support to keep the initial implementation simple and avoid locking in a `$ref` resolver API prematurely.

## Design

See `docs/superpowers/specs/2026-06-22-issue-06-composite-schema-support-design.md` for the full design.

Key decisions:

- `FormulaField` gains `condition: RJSFSchema | true` (`true` = always active; see `docs/adr/0001-formula-field-condition-type.md`)
- Conditions from nested composition operators compose as `{ allOf: [...] }`
- **`$ref`**: resolved via `findSchemaDefinition` from `@rjsf/utils`; no new resolver parameter (`schema === rootSchema`)
- **`allOf`**: all branches always active; conflicts detected at analysis time
- **`oneOf` / `anyOf`**: branch conditions checked at evaluation time via `checkCondition`
- **Conflict handling**: new `formulaConflictBehavior: 'ignore' | 'warn' | 'error'` prop/option (default `'warn'`); take last on conflict; only fires on actual collisions
- **Inactive fields**: value left unchanged when condition is false
- `checkCondition: (condition, formData) => validator.isValid(condition, formData, schema)` closure built in `FormulaForm`; `validator` extracted explicitly from props
- `checkCondition` stored in a ref in `useAsyncFormulas`; required (not optional)
- `formulaConflictBehavior` flows to both `analyzeSchema` and `enrich`
- `mergeReadOnly` unchanged — a path with a formula in any branch is always read-only

**Phase 1** (this issue): `$ref`, `oneOf`, `anyOf`, `allOf`

**Phase 2** (this issue): `if/then/else` — `then` condition = `if` schema; `else` condition = `{ "not": ifSchema }`; formulas inside `if` body emit `console.warn` and are not collected (RJSF strips `if` before rendering)

## Acceptance criteria

- `analyzeSchema` recurses into `$ref`, `allOf`, `oneOf`, `anyOf`, `then`, `else`
- Formulas inside `if` schema emit `console.warn` and are not collected
- `FormulaField.condition` is set correctly for all operators, including nested composition
- `enrich` skips fields whose condition is false; leaves value unchanged
- Conflict detection fires only on actual collisions; all three `formulaConflictBehavior` modes work correctly
- All existing tests continue to pass (backward compat: all `condition` values are `true` for flat schemas)
- New tests cover all operators, conflict modes, nested conditions, and `if/then/else`

## References

See `SPEC.md` — Composite Schema Support section.
See `docs/superpowers/specs/2026-06-19-issue-02-schema-analysis-design.md` — Out of Scope section.
See `docs/adr/0001-formula-field-condition-type.md` — condition type decision.
