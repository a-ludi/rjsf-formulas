# 05 — Async formula evaluation

Status: ready-for-agent

## Depends on

- 03 (sync evaluation)

## Goal

Extend `FormulaForm` to support evaluators that return a `Promise`. Adds per-field debouncing, a dirty-flag state machine to prevent concurrent evaluations, and a loading state callback.

## Acceptance criteria

### Evaluator signature

The `evaluator` prop is widened to:
```typescript
evaluator: (formula: string, context: object) => unknown | Promise<unknown>
```

Sync return values continue to work unchanged.

### Debounce

- Formula evaluation is debounced per the `debounceMs` prop (default `300`)
- Add `debounceMs?: number` to `FormulaFormProps`
- The debounce timer resets on each incoming change; evaluation starts only after the user pauses

### Per-field state machine

Each computed field independently tracks evaluation state:

```
idle
  → change arrives → [debounce] → start evaluation → running
running
  → change arrives during evaluation → running+dirty
  → evaluation finishes (success or error) → idle
running+dirty
  → change arrives → running+dirty  (no-op)
  → evaluation finishes → start new evaluation immediately → running
```

- No concurrent evaluations per field
- At most one queued re-evaluation per field at any time
- A finished evaluation always reflects the most recent data

### Loading state

- While a field is in `running` or `running+dirty` state, it retains its **previous computed value**
- `onLoadingChange(loadingPaths: (string | number)[][])` is called whenever the set of in-flight fields changes
- Add `onLoadingChange?: (loadingPaths: (string | number)[][]) => void` to `FormulaFormProps`

### Error handling (async)

- If an async evaluation rejects, set the field to `undefined` and call `onFormulaError(path, error)` — same behaviour as sync errors

### Convergence loop (async)

- The convergence loop `await`s all formula evaluations in each pass before comparing values
- `maxConvergencePasses` and the "did not converge" error path apply identically to the sync case

### Tests

- Unit tests (with fake async evaluators) covering:
  - debounce delays evaluation
  - changes during evaluation queue exactly one re-evaluation
  - loading state is reported correctly
  - rejection sets field to `undefined` and fires `onFormulaError`
- Tests run against both RJSF v5 and v6

## References

See `SPEC.md` — Async evaluation and Error Handling sections.
