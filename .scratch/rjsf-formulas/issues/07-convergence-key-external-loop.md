# Non-deterministic formulas with `convergenceKey` cause infinite re-render loop

Status: needs-triage

## Summary

When a formula returns a non-deterministic value (e.g. includes `Date.now()`) and the user
supplies a `convergenceKey` to strip the unstable part, `enrich()` converges correctly
internally — but the result still triggers an infinite React re-render loop, because the
external loop between `useAsyncFormulas` and the parent component is guarded only by raw
`deepEqual`, which is unaware of `convergenceKey`.

## Reproduction

Schema with a formula that embeds a fresh timestamp:

```ts
result: {
  type: 'object',
  'x-formula': '({value: price * quantity, timestamp: Date.now()})',
}
```

`convergenceKey` strips the timestamp for comparison:

```ts
convergenceKey={(v) => v?.value}
```

Parent component stores `formData` in state and passes it back as a prop:

```tsx
const [data, setData] = useState(initialData)
<FormulaForm
  formData={data}
  onChange={e => setData(e.formData)}
  convergenceKey={v => v?.value}
  ...
/>
```

**Result:** CPU spins indefinitely. Each render produces a fresh `Date.now()`, which propagates
via `onChange` → parent state → `formData` prop → the `deepEqual` guard in `useAsyncFormulas`
sees `T_n ≠ T_{n-1}` → fires `handleInput` again → new render → ...

## Root cause

`convergenceKey` only governs `enrich()`'s internal multi-pass loop (via `allConverged`).
It has no effect on the external circuit:

```
enrich() returns {value:30, timestamp:T2}      ← converged internally ✓
  → setEnrichedFormData({..., timestamp:T2})
  → onChange fires with new enrichedFormData
  → parent setState({..., timestamp:T2})
  → formData prop changes
  → useEffect (no-dep) in useAsyncFormulas:
      deepEqual({..., T2}, lastExternalFormDataRef {..T1}) → FALSE
      → handleInput fires
  → enrich() runs again → T3 → ...
```

`maxConvergencePasses` is also irrelevant here: each external loop iteration is a *separate*
`enrich()` call that converges in 1–2 passes. The cap on internal passes never applies.

## Expected behaviour

When the incoming `formData` prop is convergence-equivalent to the last value processed
(by `convergenceKey` semantics, not raw deep equality), `useAsyncFormulas` should not
re-trigger evaluation.

## Proposed fix

Replace the raw `deepEqual` guard in `useAsyncFormulas`'s no-dependency `useEffect` with
a convergence-key-aware comparison: normalize formula field values on both sides using
`convergenceKey`, then deep-equal the result. If equivalent, skip `handleInput`.

Additionally, consider skipping `setEnrichedFormData` inside `startSequence` when the new
enrich result is convergence-equivalent to the previously emitted value — this avoids
publishing a new object reference in the first place, so the parent never sees a changed
`formData` prop.

## Scope

This issue is intentionally scoped to Scenario A only. The related RJSF auto-modification
loop (Scenario B/C: RJSF fires `onChange` to satisfy `minItems` or correct a type mismatch
on a formula field) is tracked separately.
