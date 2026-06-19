# 06 — Composite schema support

Status: needs-triage

## Depends on

- 02 (schema analysis)

## Goal

Extend `analyzeSchema` to recurse into JSON Schema composition operators: `$ref`, `oneOf`, `anyOf`, and `allOf`. Currently these nodes are skipped with a `console.warn` (see issue 02).

## Background

Composite schemas are common in real-world RJSF usage. Issue 02 explicitly deferred support to keep the initial implementation simple and avoid locking in a `$ref` resolver API prematurely.

## Design considerations

- **`oneOf` / `anyOf` / `allOf`**: Recurse into each branch and collect `FormulaField` descriptors from all of them. At evaluation time (issue 03), which branch is active is determined by the live data — the evaluator already handles this by evaluating against actual `formData`.
- **`$ref`**: Requires dereferencing. Adding support will likely require a new optional `resolver` parameter to `analyzeSchema` (e.g. a pre-dereferenced schema, or a resolver function). This must be designed carefully to remain non-breaking for callers that don't use `$ref`.

## Acceptance criteria

TBD — requires a design spec before implementation.

## References

See `SPEC.md` — Composite Schema Support section.
See `docs/superpowers/specs/2026-06-19-issue-02-schema-analysis-design.md` — Out of Scope section.
