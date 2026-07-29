# `convergenceKey` Prop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `convergenceKey` prop to `FormulaForm` that lets users project each computed value to a stable comparable key, so non-deterministic sub-fields (e.g. timestamps) don't prevent the convergence loop from terminating.

**Architecture:** `convergenceKey` is threaded from `FormulaFormProps` → `FormulaForm` → `useAsyncFormulas` → `enrich`, where both equality checks in the convergence loop apply it before calling `deepEqual`. Default is the identity function, preserving existing behavior exactly.

**Tech Stack:** TypeScript, React, Vitest, fast-deep-equal (already in use)

---

### Task 1: Add schema fixture and write failing `enrich` tests

**Files:**
- Modify: `tests/schemas.ts`
- Modify: `tests/enrich.test.ts`

- [ ] **Step 1: Add `compoundWithTimestamp` schema to `tests/schemas.ts`**

Append to the end of the file:

```typescript
export const compoundWithTimestamp: DemoSchema = {
  label: 'Compound value with non-deterministic sub-field',
  schema: {
    type: 'object',
    properties: {
      price: { type: 'number' },
      quantity: { type: 'number' },
      result: { type: 'object', 'x-formula': 'compound' },
    },
  } as unknown as RJSFSchema,
  formData: { price: 10, quantity: 3, result: null },
}
```

- [ ] **Step 2: Write three failing tests in `tests/enrich.test.ts`**

Append after the existing `describe('enrich', ...)` block (after the last `it(...)` in the block, before the closing `})`):

```typescript
  it('convergenceKey: non-deterministic sub-field does not prevent convergence', async () => {
    let callCount = 0
    const fields: FormulaField[] = [
      { path: ['result'], formula: 'compound', contextMode: 'siblings', condition: true },
    ]
    const nonDeterministicEval = (_formula: string, ctx: any) => ({
      value: ctx.price * ctx.quantity,
      counter: ++callCount,
    })
    const errors: Array<{ path: (string | number)[]; error: Error }> = []
    const result = await enrich(
      { price: 10, quantity: 3, result: null },
      fields,
      nonDeterministicEval,
      3,
      (path, error) => errors.push({ path, error }),
      '__formData__',
      '__path__',
      alwaysActive,
      'warn',
      (value: any) => value?.value,
    ) as any
    expect(errors).toHaveLength(0)
    expect(result.result.value).toBe(30)
  })

  it('convergenceKey: chain of computed fields still propagates correctly', async () => {
    let callCount = 0
    const fields: FormulaField[] = [
      { path: ['double'], formula: 'base * 2', contextMode: 'siblings', condition: true },
      { path: ['result'], formula: 'compound', contextMode: 'siblings', condition: true },
    ]
    const eval_ = (_formula: string, ctx: any) => {
      if (_formula === 'base * 2') return ctx.base * 2
      return { value: ctx.double, counter: ++callCount }
    }
    const errors: Array<{ path: (string | number)[]; error: Error }> = []
    const result = await enrich(
      { base: 5, double: 0, result: null },
      fields,
      eval_,
      10,
      (path, error) => errors.push({ path, error }),
      '__formData__',
      '__path__',
      alwaysActive,
      'warn',
      (value: any) => value?.value ?? value,
    ) as any
    expect(errors).toHaveLength(0)
    expect(result.double).toBe(10)
    expect(result.result.value).toBe(10)
  })

  it('convergenceKey: genuine circular deps still trigger onFormulaError', async () => {
    const fields: FormulaField[] = [
      { path: ['x'], formula: 'x + 1', contextMode: 'siblings', condition: true },
    ]
    const errors: Array<{ path: (string | number)[]; error: Error }> = []
    const result = await enrich(
      { x: 0 },
      fields,
      evalSimple,
      3,
      (path, error) => errors.push({ path, error }),
      '__formData__',
      '__path__',
      alwaysActive,
      'warn',
      (v) => v,
    ) as any
    expect(result.x).toBeUndefined()
    expect(errors).toHaveLength(1)
    expect(errors[0].error.message).toMatch(/did not converge/)
  })
```

- [ ] **Step 3: Run the new tests and confirm they fail**

```bash
bun test tests/enrich.test.ts
```

Expected: the three new tests **FAIL** — TypeScript will error because `enrich` does not yet accept a 10th argument.

---

### Task 2: Implement `convergenceKey` in `enrich.ts`

**Files:**
- Modify: `src/enrich.ts`

- [ ] **Step 1: Add `convergenceKey` parameter to `allConverged`**

Replace the existing `allConverged` function (lines 100–113):

```typescript
function allConverged(
  prev: unknown,
  next: unknown,
  formulaFields: FormulaField[],
  convergenceKey: (value: unknown, path: (string | number)[]) => unknown
): boolean {
  for (const field of formulaFields) {
    for (const concretePath of expandPaths(field.path, next)) {
      if (!deepEqual(
        convergenceKey(getAt(prev, concretePath), concretePath),
        convergenceKey(getAt(next, concretePath), concretePath)
      )) {
        return false
      }
    }
  }
  return true
}
```

- [ ] **Step 2: Add `convergenceKey` parameter to `enrich` and apply it in both equality checks**

Replace the `enrich` function signature (line 115) — add `convergenceKey` as an optional last parameter with a default:

```typescript
export async function enrich(
  formData: unknown,
  formulaFields: FormulaField[],
  evaluator: (formula: string, context: object) => unknown | Promise<unknown>,
  maxConvergencePasses: number,
  onFormulaError: ((path: (string | number)[], error: Error) => void) | undefined,
  formulaDataKey: string,
  formulaPathKey: string,
  checkCondition: (condition: RJSFSchema, formData: unknown) => boolean,
  formulaConflictBehavior: 'ignore' | 'warn' | 'error',
  convergenceKey: (value: unknown, path: (string | number)[]) => unknown = v => v
): Promise<unknown> {
```

Inside the convergence loop, replace the `allConverged` call (currently `if (allConverged(current, candidate, deduped)) {`) with:

```typescript
    if (allConverged(current, candidate, deduped, convergenceKey)) {
```

In the non-convergence detection block at the end of `enrich`, replace:

```typescript
      if (!deepEqual(getAt(current, concretePath), getAt(candidate, concretePath))) {
```

with:

```typescript
      if (!deepEqual(
        convergenceKey(getAt(current, concretePath), concretePath),
        convergenceKey(getAt(candidate, concretePath), concretePath)
      )) {
```

- [ ] **Step 3: Run the enrich tests and confirm they pass**

```bash
bun test tests/enrich.test.ts
```

Expected: all tests in `enrich.test.ts` **PASS** for both `rjsf-v5` and `rjsf-v6` projects.

- [ ] **Step 4: Commit**

```bash
git add src/enrich.ts tests/enrich.test.ts tests/schemas.ts
git commit -m "feat: add convergenceKey param to enrich — allows non-deterministic sub-fields to converge"
```

---

### Task 3: Write failing `FormulaForm` integration test

**Files:**
- Modify: `tests/FormulaForm.test.tsx`

- [ ] **Step 1: Add the import for `compoundWithTimestamp`**

In `tests/FormulaForm.test.tsx`, find the existing schema import block (the `import { basic, nestedObject, ... } from './schemas'` statement) and add `compoundWithTimestamp` to the import list:

```typescript
import {
  basic,
  nestedObject,
  extendedContext,
  customFormulaDataKey,
  customFormulaPathKey,
  customKey,
  errorHandling,
  allOfBranch,
  oneOfBranch,
  ifThenBranch,
  ifElseBranch,
  refResolved,
  compoundWithTimestamp,
} from './schemas'
```

- [ ] **Step 2: Append the failing test to `tests/FormulaForm.test.tsx`**

Add a new `describe` block at the end of the file:

```typescript
describe('FormulaForm — convergenceKey', () => {
  it('prevents onFormulaError for compound values with non-deterministic sub-fields', async () => {
    vi.useFakeTimers()
    let callCount = 0
    const onFormulaError = vi.fn()
    const nonDeterministicEval = (_formula: string, ctx: any) => ({
      value: ctx.price * ctx.quantity,
      counter: ++callCount,
    })
    const MockForm = vi.fn(() => <div />) as any
    render(
      <FormulaForm
        schema={compoundWithTimestamp.schema as any}
        formData={compoundWithTimestamp.formData as any}
        validator={validator}
        evaluator={nonDeterministicEval}
        convergenceKey={(value: any) => value?.value}
        onFormulaError={onFormulaError}
        Form={MockForm}
      />
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(onFormulaError).not.toHaveBeenCalled()
    const lastCall = MockForm.mock.calls[MockForm.mock.calls.length - 1]
    expect(lastCall[0].formData.result.value).toBe(30)
  })
})
```

- [ ] **Step 3: Run the new test and confirm it fails**

```bash
bun test tests/FormulaForm.test.tsx
```

Expected: the new test **FAILS** — TypeScript will error because `convergenceKey` is not yet a prop on `FormulaForm`.

---

### Task 4: Thread `convergenceKey` through `useAsyncFormulas` and `FormulaForm`

**Files:**
- Modify: `src/useAsyncFormulas.ts`
- Modify: `src/FormulaForm.tsx`

- [ ] **Step 1: Add `convergenceKey` parameter to `useAsyncFormulas`**

In `src/useAsyncFormulas.ts`, add `convergenceKey` as the last parameter of the function signature (after `initialComputationMode`):

```typescript
export function useAsyncFormulas(
  formData: unknown,
  formulaFields: FormulaField[],
  evaluator: (formula: string, context: object) => unknown | Promise<unknown>,
  debounceMs: number,
  maxConvergencePasses: number,
  onFormulaError: ((path: (string | number)[], error: Error) => void) | undefined,
  onLoadingChange: ((loadingPaths: (string | number)[][]) => void) | undefined,
  contextOptions: BuildContextOptions,
  checkCondition: (condition: RJSFSchema, formData: unknown) => boolean,
  formulaConflictBehavior: 'ignore' | 'warn' | 'error',
  initialComputationMode: 'always' | 'skip' | 'silent',
  convergenceKey: (value: unknown, path: (string | number)[]) => unknown
): { enrichedFormData: unknown; handleInput: (newFormData: unknown) => void } {
```

- [ ] **Step 2: Store `convergenceKey` in a ref (same pattern as `evaluator`)**

After the existing `formulaConflictBehaviorRef` ref and its `useEffect` (around line 42–51), add:

```typescript
  const convergenceKeyRef = useRef(convergenceKey)
  useEffect(() => { convergenceKeyRef.current = convergenceKey }, [convergenceKey])
```

- [ ] **Step 3: Pass `convergenceKey` to the `enrich` call**

In `useAsyncFormulas`, find the `await enrich(...)` call and add `convergenceKeyRef.current` as the final argument:

```typescript
          const result = await enrich(
            input,
            fields,
            evaluatorRef.current,
            maxPassesRef.current,
            onFormulaErrorRef.current,
            contextOptionsRef.current.formulaDataKey,
            contextOptionsRef.current.formulaPathKey,
            checkConditionRef.current,
            formulaConflictBehaviorRef.current,
            convergenceKeyRef.current
          )
```

- [ ] **Step 4: Add `convergenceKey` to `FormulaFormProps` in `FormulaForm.tsx`**

In `src/FormulaForm.tsx`, add the new prop to `FormulaFormProps` after `initialComputationMode`:

```typescript
  /**
   * Extracts a comparable key from a computed field value for convergence checking.
   * Two values are considered converged when their keys are deeply equal.
   * Defaults to the identity function — full deep equality of the computed value.
   *
   * Useful when a formula returns a compound value that includes non-deterministic parts
   * (e.g. a timestamp) that should not prevent convergence.
   *
   * @param value - The computed field's value from a convergence pass.
   * @param path  - The concrete path of the computed field.
   * @returns The value to use for convergence comparison.
   */
  convergenceKey?: (value: unknown, path: (string | number)[]) => unknown
```

- [ ] **Step 5: Destructure `convergenceKey` with a default in `FormulaFormImpl`**

In the destructuring of `props` inside `FormulaFormImpl`, add `convergenceKey` after `initialComputationMode`:

```typescript
    initialComputationMode = 'always',
    convergenceKey = (v: unknown) => v,
    onChange,
```

- [ ] **Step 6: Pass `convergenceKey` to `useAsyncFormulas`**

In the `useAsyncFormulas(...)` call in `FormulaFormImpl`, add `convergenceKey` as the final argument:

```typescript
  const { enrichedFormData, handleInput } = useAsyncFormulas(
    formData,
    formulaFields,
    evaluator,
    debounceMs,
    maxConvergencePasses,
    onFormulaError,
    onLoadingChange,
    contextOptions,
    checkCondition,
    formulaConflictBehavior,
    initialComputationMode,
    convergenceKey
  )
```

- [ ] **Step 7: Run the full test suite and confirm all tests pass**

```bash
bun test
```

Expected: all tests **PASS** across both `rjsf-v5` and `rjsf-v6` projects.

- [ ] **Step 8: Commit**

```bash
git add src/useAsyncFormulas.ts src/FormulaForm.tsx tests/FormulaForm.test.tsx
git commit -m "feat: thread convergenceKey through useAsyncFormulas and FormulaForm"
```

---

### Task 5: Update SPEC.md and CHANGELOG.md

**Files:**
- Modify: `SPEC.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add `convergenceKey` to the `FormulaFormProps` block in `SPEC.md`**

In `SPEC.md`, find the `// Evaluation tuning` comment in the `FormulaFormProps` type block and add `convergenceKey` after `debounceMs`:

```typescript
    // Evaluation tuning
    maxConvergencePasses?: number // default: 10
    debounceMs?: number           // default: 300
    convergenceKey?: (value: unknown, path: (string | number)[]) => unknown  // default: identity
```

- [ ] **Step 2: Add a `convergenceKey` paragraph to the Convergence loop section in `SPEC.md`**

In `SPEC.md`, find the `### Convergence loop` section. After the numbered list (steps 1–5), add:

```markdown
### Convergence key

By default the convergence check uses full deep equality of each computed value. When a formula returns a compound value containing a non-deterministic sub-field (such as a computation timestamp), the output differs on every pass even if the meaningful parts are stable, and the loop always reaches `maxConvergencePasses`.

The `convergenceKey` prop addresses this: it receives each computed value and its path and returns the part that should govern convergence. The library calls `deepEqual` on the returned keys instead of the raw values.

```tsx
<FormulaForm
  convergenceKey={(value, path) =>
    path.at(-1) === 'result' ? (value as any)?.value : value
  }
  ...
/>
```

`convergenceKey` is called once per computed field per convergence comparison (on both the previous and current pass values). The default is the identity function, preserving existing deep-equality behavior exactly.
```

- [ ] **Step 3: Add entry to `CHANGELOG.md`**

In `CHANGELOG.md`, find the `## [Unreleased]` section and add:

```markdown
## [Unreleased]

### Added

- `convergenceKey` prop on `FormulaForm` (`(value: unknown, path: (string|number)[]) => unknown`, default: identity): extracts a comparable key from each computed field value for the convergence check. Useful when a formula returns a compound value containing non-deterministic sub-fields (e.g. a timestamp) — strip the non-deterministic part so convergence is determined by the stable remainder only.
```

- [ ] **Step 4: Run the full test suite one final time**

```bash
bun test
```

Expected: all tests **PASS**.

- [ ] **Step 5: Commit**

```bash
git add SPEC.md CHANGELOG.md
git commit -m "docs: document convergenceKey prop in SPEC and CHANGELOG"
```
