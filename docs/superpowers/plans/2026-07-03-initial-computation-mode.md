# initialComputationMode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `initialComputationMode` prop to `FormulaForm` that lets consumers control whether the initial mount evaluation fires `onChange` (`'always'`), skips evaluation entirely (`'skip'`), or evaluates silently without notifying the parent (`'silent'`).

**Architecture:** `useAsyncFormulas` receives the mode and skips `handleInput` on mount for `'skip'`. `FormulaForm` gates the `enrichedFormData` effect with a `suppressCountRef` — a counter that is decremented on each suppressed effect call and reset on every (re)mount to correctly handle React StrictMode. `'skip'` suppresses 1 initial fire; `'silent'` suppresses 2 (original formData fire + enriched-result fire).

**Tech Stack:** React (hooks, refs, useEffect), TypeScript, Vitest, @testing-library/react.

---

## Files

- **Modify:** `src/FormulaForm.tsx` — add prop type + JSDoc, destructure with default, add suppression refs, gate `enrichedFormData` effect, pass mode to `useAsyncFormulas`
- **Modify:** `src/useAsyncFormulas.ts` — add `initialComputationMode` parameter, skip `handleInput` on mount when `'skip'`
- **Modify:** `tests/FormulaForm.test.tsx` — add test suites for `'skip'` and `'silent'` modes
- **Modify:** `SPEC.md` — add prop to `FormulaFormProps` type block and expand mount-behaviour prose
- **Modify:** `CHANGELOG.md` — add `Added` entry under `[Unreleased]`

---

## Task 1: Write failing tests

**Files:**
- Modify: `tests/FormulaForm.test.tsx`

- [ ] **Step 1: Append test suites to `tests/FormulaForm.test.tsx`**

Add after the last `describe` block (after `FormulaForm — React StrictMode compatibility`):

```tsx
describe('FormulaForm — initialComputationMode: skip', () => {
  it('does not call onChange on mount', async () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    render(
      <FormulaForm
        schema={basic.schema as any}
        formData={basic.formData as any}
        validator={validator}
        evaluator={evalSimple}
        onChange={onChange}
        initialComputationMode="skip"
        Form={vi.fn(() => <div />) as any}
      />
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('renders original formData without enrichment', async () => {
    vi.useFakeTimers()
    const MockForm = vi.fn<(props: any) => React.ReactElement>(() => <div />)
    render(
      <FormulaForm
        schema={basic.schema as any}
        formData={basic.formData as any}
        validator={validator}
        evaluator={evalSimple}
        initialComputationMode="skip"
        Form={MockForm as any}
      />
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    const lastCall = MockForm.mock.calls[MockForm.mock.calls.length - 1]
    expect(lastCall[0].formData).toEqual({ price: 10, quantity: 3, total: 0 })
  })

  it('calls onChange normally after a user edit', async () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    const MockForm = vi.fn(({ onChange: innerOnChange }: any) => (
      <button onClick={() => innerOnChange({ formData: { price: 5, quantity: 4, total: 0 } })}>
        change
      </button>
    ))
    const { getByText } = render(
      <FormulaForm
        schema={basic.schema as any}
        formData={basic.formData as any}
        validator={validator}
        evaluator={evalSimple}
        onChange={onChange}
        initialComputationMode="skip"
        Form={MockForm as any}
      />
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    onChange.mockClear()
    act(() => { getByText('change').click() })
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ formData: { price: 5, quantity: 4, total: 20 } }),
      undefined
    )
  })
})

describe('FormulaForm — initialComputationMode: silent', () => {
  it('does not call onChange on mount', async () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    render(
      <FormulaForm
        schema={basic.schema as any}
        formData={basic.formData as any}
        validator={validator}
        evaluator={evalSimple}
        onChange={onChange}
        initialComputationMode="silent"
        Form={vi.fn(() => <div />) as any}
      />
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('enriches the inner form formData after mount', async () => {
    vi.useFakeTimers()
    const MockForm = vi.fn<(props: any) => React.ReactElement>(() => <div />)
    render(
      <FormulaForm
        schema={basic.schema as any}
        formData={basic.formData as any}
        validator={validator}
        evaluator={evalSimple}
        initialComputationMode="silent"
        Form={MockForm as any}
      />
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    const lastCall = MockForm.mock.calls[MockForm.mock.calls.length - 1]
    expect(lastCall[0].formData).toEqual({ price: 10, quantity: 3, total: 30 })
  })

  it('calls onChange normally after a user edit', async () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    const MockForm = vi.fn(({ onChange: innerOnChange }: any) => (
      <button onClick={() => innerOnChange({ formData: { price: 5, quantity: 4, total: 30 } })}>
        change
      </button>
    ))
    const { getByText } = render(
      <FormulaForm
        schema={basic.schema as any}
        formData={basic.formData as any}
        validator={validator}
        evaluator={evalSimple}
        onChange={onChange}
        initialComputationMode="silent"
        Form={MockForm as any}
      />
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    onChange.mockClear()
    act(() => { getByText('change').click() })
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ formData: { price: 5, quantity: 4, total: 20 } }),
      undefined
    )
  })

  it('still calls onFormulaError during initial evaluation', async () => {
    vi.useFakeTimers()
    const onFormulaError = vi.fn()
    const brokenEval = (formula: string, ctx: object) => {
      if (formula === 'throw_error') throw new Error('boom')
      return evalSimple(formula, ctx)
    }
    render(
      <FormulaForm
        schema={errorHandling.schema as any}
        formData={errorHandling.formData as any}
        validator={validator}
        evaluator={brokenEval}
        initialComputationMode="silent"
        onFormulaError={onFormulaError}
        Form={vi.fn(() => <div />) as any}
      />
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(onFormulaError).toHaveBeenCalledWith(['bad'], expect.any(Error))
  })

  it('still calls onLoadingChange during initial evaluation', async () => {
    vi.useFakeTimers()
    const onLoadingChange = vi.fn()
    render(
      <FormulaForm
        schema={basic.schema as any}
        formData={basic.formData as any}
        validator={validator}
        evaluator={evalSimple}
        initialComputationMode="silent"
        onLoadingChange={onLoadingChange}
        Form={vi.fn(() => <div />) as any}
      />
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(onLoadingChange).toHaveBeenCalledWith([['total']])
    expect(onLoadingChange).toHaveBeenCalledWith([])
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
bun run test --reporter=verbose 2>&1 | grep -A2 'initialComputationMode'
```

Expected: TypeScript errors (`Property 'initialComputationMode' does not exist`) or test failures. Any failure confirms red.

---

## Task 2: Implement `'skip'` mode

**Files:**
- Modify: `src/FormulaForm.tsx`
- Modify: `src/useAsyncFormulas.ts`

- [ ] **Step 1: Add `initialComputationMode` to `FormulaFormProps` in `src/FormulaForm.tsx`**

After the `formulaConflictBehavior` prop (around line 96), add:

```typescript
  /**
   * Controls what happens when the component mounts and runs its first formula evaluation pass.
   *
   * - `'always'` (default): evaluate on mount and call `onChange` with the enriched result.
   * - `'skip'`: skip evaluation on mount entirely; the form renders with the initial `formData` values as-is.
   * - `'silent'`: evaluate on mount (so the UI shows correct values), but do not call `onChange`.
   *   User edits trigger `onChange` normally from that point on.
   *
   * `onFormulaError` and `onLoadingChange` fire normally regardless of mode.
   */
  initialComputationMode?: 'always' | 'skip' | 'silent'
```

- [ ] **Step 2: Destructure `initialComputationMode` in `FormulaFormImpl`**

In `FormulaFormImpl`, update the destructuring (around line 140) to include:

```typescript
  const {
    schema,
    formData,
    validator,
    uiSchema,
    evaluator,
    Form: InnerForm = Form as React.ComponentType<FormProps<T, S, F>>,
    formulaKey = 'x-formula',
    formulaContextKey = 'x-formula-context',
    formulaDataKey = '__formData__',
    formulaPathKey = '__path__',
    maxConvergencePasses = 10,
    debounceMs = 300,
    onFormulaError,
    onLoadingChange,
    formulaConflictBehavior = 'warn',
    initialComputationMode = 'always',
    onChange,
    ...rest
  } = props
```

- [ ] **Step 3: Add suppression refs and mount-reset effect in `FormulaForm.tsx`**

After the `checkCondition` `useCallback` (around line 179) and before `useAsyncFormulas`, add:

```typescript
  const suppressCountRef = useRef(
    initialComputationMode === 'always' ? 0 :
    initialComputationMode === 'silent' ? 2 : 1
  )

  // Reset suppression counter on every (re)mount so StrictMode's simulated
  // unmount+remount cycle starts each phase fresh.
  useEffect(() => {
    const count =
      initialComputationMode === 'always' ? 0 :
      initialComputationMode === 'silent' ? 2 : 1
    suppressCountRef.current = count
    return () => { suppressCountRef.current = count }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 4: Pass `initialComputationMode` to `useAsyncFormulas`**

Update the `useAsyncFormulas` call (around line 181):

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
    initialComputationMode
  )
```

- [ ] **Step 5: Gate the `enrichedFormData` effect with the suppression counter**

Replace the existing `enrichedFormData` effect (around line 197):

```typescript
  useEffect(() => {
    if (formulaFields.length === 0) return
    if (suppressCountRef.current > 0) {
      suppressCountRef.current--
      return
    }
    onChangeRef.current?.({ formData: enrichedFormData as T } as IChangeEvent<T, S, F>, undefined)
  }, [enrichedFormData]) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 6: Add `initialComputationMode` parameter to `useAsyncFormulas`**

In `src/useAsyncFormulas.ts`, update the function signature (add as last parameter):

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
  initialComputationMode: 'always' | 'skip' | 'silent'
): { enrichedFormData: unknown; handleInput: (newFormData: unknown) => void }
```

- [ ] **Step 7: Skip `handleInput` on mount when mode is `'skip'`**

In the no-dep `useEffect` (around line 144), update the mount branch:

```typescript
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      lastExternalFormDataRef.current = formData
      if (initialComputationMode !== 'skip') {
        handleInput(formData)
      }
    } else if (!deepEqual(formData, lastExternalFormDataRef.current)) {
      lastExternalFormDataRef.current = formData
      handleInput(formData)
    }
  }) // runs every render — guarded by deep equality
```

- [ ] **Step 8: Run tests — verify `'skip'` tests pass**

```bash
bun run test --reporter=verbose 2>&1 | grep -E '(PASS|FAIL|skip)'
```

Expected: all three `initialComputationMode: skip` tests pass; `'silent'` tests still fail.

- [ ] **Step 9: Commit**

```bash
git add src/FormulaForm.tsx src/useAsyncFormulas.ts tests/FormulaForm.test.tsx
git commit -m "feat: add initialComputationMode prop — implement 'skip' mode"
```

---

## Task 3: Implement `'silent'` mode

**Files:**
- Modify: `src/FormulaForm.tsx` (suppression count of 2 is already wired up from Task 2 — no additional code needed)

- [ ] **Step 1: Run the `'silent'` tests as-is**

```bash
bun run test --reporter=verbose 2>&1 | grep -E '(silent)'
```

The suppression counter is already initialized to 2 for `'silent'` and the `useAsyncFormulas` change doesn't skip `'silent'` evaluation. If the tests pass already, skip to the commit step.

If any `'silent'` test fails, the most likely cause is the `enrichedFormData` effect firing fewer or more times than expected. Inspect the failure message and adjust the initial count in `suppressCountRef` accordingly.

- [ ] **Step 2: Run the full test suite**

```bash
bun run test
```

Expected: all tests pass (both new suites and all pre-existing tests).

- [ ] **Step 3: Commit**

```bash
git add src/FormulaForm.tsx
git commit -m "feat: add initialComputationMode prop — implement 'silent' mode"
```

---

## Task 4: Update documentation

**Files:**
- Modify: `SPEC.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add `initialComputationMode` to `FormulaFormProps` type block in `SPEC.md`**

In the `FormulaFormProps` code block (around line 48), add after `debounceMs`:

```typescript
    // Initial computation control
    initialComputationMode?: 'always' | 'skip' | 'silent'  // default: 'always'
```

- [ ] **Step 2: Expand the Mount behaviour section in `SPEC.md`**

Replace the existing mount paragraph (around line 148):

```markdown
### Mount behaviour

`initialComputationMode` controls what happens on the first formula evaluation pass:

| Mode | Evaluate on mount? | Call `onChange` on mount? |
|---|---|---|
| `'always'` (default) | yes | yes |
| `'skip'` | no | no |
| `'silent'` | yes | no |

**`'always'`**: all formula fields are recomputed and `onChange` is called with the enriched result. The formula is always authoritative over any saved values in the initial `formData`.

**`'skip'`**: no evaluation on mount. The form renders with the initial `formData` values as-is. Useful when the consumer has already-correct saved data and wants to avoid an unsolicited `onChange` call on load.

**`'silent'`**: evaluation runs so the UI immediately shows correct computed values, but `onChange` is not called. Useful when the consumer wants the form to display correct values without marking the form as dirty. The parent's state and the form's displayed values are momentarily out of sync; this resolves on the first user edit.

`onFormulaError` and `onLoadingChange` fire normally regardless of mode.

"Initial computation" is strictly the first evaluation on mount. External `formData` changes from the parent after mount always trigger normal evaluation and `onChange` regardless of mode.
```

- [ ] **Step 3: Add CHANGELOG entry**

In `CHANGELOG.md`, under `## [Unreleased]`, add:

```markdown
## [Unreleased]

### Added

- `initialComputationMode` prop on `FormulaForm` (`'always'` | `'skip'` | `'silent'`, default `'always'`): controls the initial formula evaluation on mount. `'always'` preserves existing behaviour (evaluate and fire `onChange`); `'skip'` skips evaluation entirely; `'silent'` evaluates so the UI shows correct values but does not fire `onChange`.
```

- [ ] **Step 4: Run tests one final time**

```bash
bun run test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add SPEC.md CHANGELOG.md
git commit -m "docs: document initialComputationMode prop in SPEC and CHANGELOG"
```
