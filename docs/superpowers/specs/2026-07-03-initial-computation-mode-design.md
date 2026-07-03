# Design: `initialComputationMode` prop

## Overview

Add an `initialComputationMode` prop to `FormulaForm` that lets consumers control what happens when the component mounts and runs its first formula evaluation pass.

---

## Prop

```typescript
initialComputationMode?: 'always' | 'skip' | 'silent'
// default: 'always'
```

Added to `FormulaFormProps`. No changes to `analyzeSchema`, `enrich`, `buildContext`, or `mergeReadOnly`.

---

## Modes

| Mode | Evaluate on mount? | Call `onChange` on mount? |
|---|---|---|
| `'always'` (default) | yes | yes |
| `'skip'` | no | no |
| `'silent'` | yes | no |

### `'always'`

Current behavior. On mount, all formula fields are evaluated and `onChange` is called with the enriched result. The formula is authoritative over any saved values in `formData`.

### `'skip'`

No evaluation on mount. The form renders with whatever values are in the initial `formData` — computed field values are taken as-is. User edits trigger evaluation normally from that point on.

### `'silent'`

Evaluate on mount and update internal state (so the UI immediately shows correct computed values), but do not call `onChange`. The parent is not notified of the initial enrichment. User edits trigger evaluation and `onChange` normally from that point on.

**Note:** With `'silent'`, the parent's state and the form's displayed values are momentarily out of sync — the parent still holds the original `formData` while the form shows enriched values. This resolves on the first user edit. Consumers using `'silent'` should be aware of this.

"Initial computation" is strictly the first evaluation on mount. External `formData` changes from the parent after mount always go through the normal evaluation + `onChange` path regardless of mode.

---

## Effect on other callbacks

`initialComputationMode` only gates `onChange`. The other callbacks are unaffected:

- **`onLoadingChange`**: fires normally during `'silent'` initial evaluation.
- **`onFormulaError`**: fires normally for any formula error during initial evaluation, even in `'silent'` mode. In `'skip'` mode, no evaluation runs so neither callback fires.

---

## Implementation

Two touch points only:

### 1. `useAsyncFormulas`

Receives `initialComputationMode`. In the mount effect:

- `'skip'`: skip the `handleInput(formData)` call; set `enrichedFormData` directly to the initial `formData` with no evaluation.
- `'always'` / `'silent'`: call `handleInput(formData)` as today.

### 2. `FormulaForm`

The `useEffect` that watches `enrichedFormData` and calls `onChange` must suppress calls during the initial computation phase. The effect fires on mount regardless of whether evaluation ran, so both `'skip'` and `'silent'` require suppression.

A `suppressInitialOnChangeRef` (boolean ref, starts `true` for `'skip'` and `'silent'`, `false` for `'always'`) gates the call:

- While `suppressInitialOnChangeRef.current` is `true`: skip the `onChange` call.
- The ref is flipped to `false` only once the initial computation phase is complete:
  - **`'skip'`**: flip immediately on first effect run (no evaluation will follow).
  - **`'silent'`**: flip after the initial evaluation result has been processed (i.e. after `enrichedFormData` first differs from the original `formData`).
- All subsequent effect fires call `onChange` normally.

---

## Tests

New test cases in `tests/FormulaForm.test.tsx`, one per mode:

- **`'always'`** (existing behavior, verify it still works): `onChange` is called on mount with the enriched formData.
- **`'skip'`**: `onChange` is not called on mount; the form renders with the original formData values; a subsequent user edit triggers `onChange` normally.
- **`'silent'`**: `onChange` is not called for the initial evaluation; the internal enriched state is updated (so enriched values are visible in the rendered form); a subsequent user edit triggers `onChange` normally.
- **`'silent'` with `onFormulaError`**: an evaluator error during initial evaluation still calls `onFormulaError` even though `onChange` is suppressed.
- **`'silent'` with `onLoadingChange`**: loading callbacks fire normally during initial evaluation even though `onChange` is suppressed.

---

## Documentation

- **JSDoc** on the `initialComputationMode` prop in `FormulaFormProps` — describe each mode and the default.
- **`SPEC.md`** — add `initialComputationMode` to the `FormulaFormProps` type block and a short prose section under Data Flow describing mount behaviour per mode.
- **`CHANGELOG.md`** — add an `Added` entry under `[Unreleased]`.
