# Issue 04 — Extended Formula Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the `"extended"` context mode — when a computed field sets `x-formula-context: "extended"`, the evaluator receives siblings plus the full `formData` and the field's own path under configurable keys.

**Architecture:** One new file (`src/buildContext.ts`) replaces the inline `buildContext` helper in `src/enrich.ts`. The new function handles both context modes. `src/enrich.ts` is updated to import from it and thread two new options (`formulaDataKey`, `formulaPathKey`) through the call chain. `src/FormulaForm.tsx` exposes those options as optional props.

**Tech Stack:** TypeScript, Vitest (multi-project config, all four projects must stay green throughout).

**Spec:** `docs/superpowers/specs/2026-06-19-issue-04-extended-context-design.md`

**Depends on:** Issue 03 (`src/enrich.ts` with `buildContext`, `applyAllFormulas`, `enrich` must be in place).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/buildContext.ts` | Create | Pure function — constructs evaluator context for both `siblings` and `extended` modes |
| `src/enrich.ts` | Modify | Remove inline `buildContext`; import from `./buildContext`; add `formulaDataKey`/`formulaPathKey` params |
| `src/FormulaForm.tsx` | Modify | Add `formulaDataKey` and `formulaPathKey` props; thread through to `enrich` |
| `tests/buildContext.test.ts` | Create | Full unit test suite for `buildContext` |
| `tests/enrich.test.ts` | Modify | Remove the `buildContext` describe block (tests moved to `buildContext.test.ts`) |
| `tests/FormulaForm.test.tsx` | Modify | Add integration tests for extended context and custom key props |

---

### Task 1: `buildContext` module

**Files:**
- Create: `src/buildContext.ts`
- Create: `tests/buildContext.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/buildContext.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildContext } from '../src/buildContext'
import type { FormulaField } from '../src/analyzeSchema'

const defaultOpts = { formulaDataKey: '__formData__', formulaPathKey: '__path__' }

const siblingsField: FormulaField = {
  path: ['total'],
  formula: 'price * quantity',
  contextMode: 'siblings',
}

const extendedField: FormulaField = {
  path: ['total'],
  formula: '__formData__.price * quantity',
  contextMode: 'extended',
}

describe('buildContext — siblings mode', () => {
  it('returns sibling fields of the target', () => {
    const data = { price: 10, quantity: 3, total: 0 }
    const result = buildContext(siblingsField, ['total'], data, defaultOpts)
    expect(result).toEqual({ price: 10, quantity: 3, total: 0 })
  })

  it('does not inject __formData__ or __path__', () => {
    const data = { price: 10, quantity: 3, total: 0 }
    const result = buildContext(siblingsField, ['total'], data, defaultOpts) as any
    expect(result.__formData__).toBeUndefined()
    expect(result.__path__).toBeUndefined()
  })

  it('returns siblings for a nested field', () => {
    const data = { order: { price: 5, quantity: 2, total: 0 } }
    const field: FormulaField = { ...siblingsField, path: ['order', 'total'] }
    const result = buildContext(field, ['order', 'total'], data, defaultOpts)
    expect(result).toEqual({ price: 5, quantity: 2, total: 0 })
  })
})

describe('buildContext — extended mode', () => {
  it('includes sibling fields', () => {
    const data = { price: 10, quantity: 3, total: 0 }
    const result = buildContext(extendedField, ['total'], data, defaultOpts) as any
    expect(result.price).toBe(10)
    expect(result.quantity).toBe(3)
    expect(result.total).toBe(0)
  })

  it('injects __formData__ as the full candidateFormData', () => {
    const data = { price: 10, quantity: 3, total: 0 }
    const result = buildContext(extendedField, ['total'], data, defaultOpts) as any
    expect(result.__formData__).toBe(data)
  })

  it('injects __path__ as the resolved path', () => {
    const data = { price: 10, quantity: 3, total: 0 }
    const result = buildContext(extendedField, ['total'], data, defaultOpts) as any
    expect(result.__path__).toEqual(['total'])
  })

  it('injects the concrete array index in __path__, not a sentinel', () => {
    const data = { items: [{ price: 5, quantity: 2, total: 0 }] }
    const field: FormulaField = { ...extendedField, path: ['items', 0, 'total'] }
    const result = buildContext(field, ['items', 1, 'total'], data, defaultOpts) as any
    expect(result.__path__).toEqual(['items', 1, 'total'])
  })

  it('uses custom formulaDataKey', () => {
    const data = { a: 1, b: 0 }
    const field: FormulaField = { ...extendedField, path: ['b'] }
    const result = buildContext(field, ['b'], data, {
      formulaDataKey: 'formData',
      formulaPathKey: '__path__',
    }) as any
    expect(result.formData).toBe(data)
    expect(result.__formData__).toBeUndefined()
  })

  it('uses custom formulaPathKey', () => {
    const data = { a: 1, b: 0 }
    const field: FormulaField = { ...extendedField, path: ['b'] }
    const result = buildContext(field, ['b'], data, {
      formulaDataKey: '__formData__',
      formulaPathKey: 'fieldPath',
    }) as any
    expect(result.fieldPath).toEqual(['b'])
    expect(result.__path__).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to see them fail**

```bash
bun run test
```

Expected: failures in all four projects — `src/buildContext.ts` does not exist.

- [ ] **Step 3: Implement `buildContext`**

Create `src/buildContext.ts`:

```typescript
import type { FormulaField } from './analyzeSchema'

export type BuildContextOptions = {
  formulaDataKey: string
  formulaPathKey: string
}

export function buildContext(
  field: FormulaField,
  resolvedPath: (string | number)[],
  candidateFormData: unknown,
  options: BuildContextOptions
): object {
  const parentPath = resolvedPath.slice(0, -1)
  const parent = parentPath.reduce<unknown>((curr, key) => {
    if (curr == null || typeof curr !== 'object') return undefined
    return (curr as Record<string | number, unknown>)[key]
  }, candidateFormData)

  const siblings =
    parent != null && typeof parent === 'object' && !Array.isArray(parent)
      ? { ...(parent as object) }
      : {}

  if (field.contextMode === 'extended') {
    return {
      ...siblings,
      [options.formulaDataKey]: candidateFormData,
      [options.formulaPathKey]: resolvedPath,
    }
  }

  return siblings
}
```

- [ ] **Step 4: Run tests to see them pass**

```bash
bun run test --reporter=verbose
```

Expected: all `buildContext` tests pass in all four projects (`rjsf-v6`, `rjsf-v5`, `rjsf-v6-react`, `rjsf-v5-react`).

- [ ] **Step 5: Commit**

```bash
git add src/buildContext.ts tests/buildContext.test.ts
git commit -m "feat: add buildContext module with siblings and extended mode support"
```

---

### Task 2: Update `enrich.ts` to use the new `buildContext`

**Files:**
- Modify: `src/enrich.ts`
- Modify: `tests/enrich.test.ts`

The inline `buildContext` in `src/enrich.ts` is replaced by an import from `./buildContext`. Two new parameters (`formulaDataKey`, `formulaPathKey`) are threaded from `enrich` → `applyAllFormulas` → `buildContext`.

- [ ] **Step 1: Update `tests/enrich.test.ts` to remove the `buildContext` describe block**

The `buildContext` tests now live in `tests/buildContext.test.ts`. Find the `buildContext` describe block in `tests/enrich.test.ts` and remove it:

```typescript
// REMOVE this entire block from tests/enrich.test.ts:
describe('buildContext', () => {
  it('returns sibling fields of the target', () => {
    // ...
  })

  it('returns siblings for a nested field', () => {
    // ...
  })
})
```

Also remove `buildContext` from the import at the top of `tests/enrich.test.ts`:

```typescript
// Before:
import { getAt, setAt, expandPaths, buildContext, ARRAY_INDEX } from '../src/enrich'

// After:
import { getAt, setAt, expandPaths, ARRAY_INDEX } from '../src/enrich'
```

- [ ] **Step 2: Run tests to verify existing tests still pass**

```bash
bun run test --reporter=verbose
```

Expected: all tests pass (the `buildContext` import is removed so no broken imports, and the new `buildContext.test.ts` tests we wrote in Task 1 still pass).

- [ ] **Step 3: Update `src/enrich.ts`**

Apply three changes to `src/enrich.ts`:

**Change 1** — Add import at the top of the file (after the existing imports):

```typescript
import { buildContext as buildContextFn } from './buildContext'
import type { BuildContextOptions } from './buildContext'
```

**Change 2** — Remove the exported `buildContext` function (the one that currently reads):

```typescript
export function buildContext(data: unknown, path: (string | number)[]): object {
  const parentPath = path.slice(0, -1)
  const parent = getAt(data, parentPath)
  if (parent != null && typeof parent === 'object' && !Array.isArray(parent)) {
    return { ...(parent as object) }
  }
  return {}
}
```

**Change 3** — Update `applyAllFormulas` to accept and use context options. Replace the function signature and the `buildContext` call inside it:

```typescript
function applyAllFormulas(
  formData: unknown,
  formulaFields: FormulaField[],
  evaluator: (formula: string, context: object) => unknown,
  onFormulaError: ((path: (string | number)[], error: Error) => void) | undefined,
  contextOptions: BuildContextOptions
): unknown {
  const result = structuredClone(formData)

  for (const field of formulaFields) {
    for (const concretePath of expandPaths(field.path, result)) {
      try {
        const context = buildContextFn(field, concretePath, result, contextOptions)
        const value = evaluator(field.formula, context)
        setAt(result, concretePath, value)
      } catch (err) {
        onFormulaError?.(
          concretePath,
          err instanceof Error ? err : new Error(String(err))
        )
        setAt(result, concretePath, undefined)
      }
    }
  }

  return result
}
```

**Change 4** — Update `enrich` to accept and forward `formulaDataKey` and `formulaPathKey`:

```typescript
export function enrich(
  formData: unknown,
  formulaFields: FormulaField[],
  evaluator: (formula: string, context: object) => unknown,
  maxConvergencePasses: number,
  onFormulaError: ((path: (string | number)[], error: Error) => void) | undefined,
  formulaDataKey = '__formData__',
  formulaPathKey = '__path__'
): unknown {
  if (formulaFields.length === 0) return formData

  const contextOptions: BuildContextOptions = { formulaDataKey, formulaPathKey }
  let current = formData

  for (let pass = 0; pass < maxConvergencePasses; pass++) {
    const candidate = applyAllFormulas(current, formulaFields, evaluator, onFormulaError, contextOptions)
    if (allConverged(current, candidate, formulaFields)) return candidate
    current = candidate
  }

  // maxConvergencePasses exceeded — identify and report non-converging fields
  const candidate = applyAllFormulas(current, formulaFields, evaluator, onFormulaError, contextOptions)
  const result = structuredClone(candidate)

  for (const field of formulaFields) {
    for (const concretePath of expandPaths(field.path, candidate)) {
      if (!deepEqual(getAt(current, concretePath), getAt(candidate, concretePath))) {
        onFormulaError?.(
          concretePath,
          new Error(
            `[rjsf-formulas] Formula at [${concretePath.join(', ')}] did not converge after ${maxConvergencePasses} passes`
          )
        )
        setAt(result, concretePath, undefined)
      }
    }
  }

  return result
}
```

- [ ] **Step 4: Run tests to see them pass**

```bash
bun run test --reporter=verbose
```

Expected: all tests pass in all four projects. The `enrich` tests still work because `formulaDataKey` and `formulaPathKey` default to `'__formData__'` and `'__path__'` respectively — existing call sites are unaffected.

- [ ] **Step 5: Commit**

```bash
git add src/enrich.ts tests/enrich.test.ts
git commit -m "refactor: use buildContext module in enrich, thread formulaDataKey/formulaPathKey"
```

---

### Task 3: Add `formulaDataKey` and `formulaPathKey` props to `FormulaForm`

**Files:**
- Modify: `src/FormulaForm.tsx`
- Modify: `tests/FormulaForm.test.tsx`

- [ ] **Step 1: Write failing integration tests**

Append to `tests/FormulaForm.test.tsx`:

```typescript
describe('FormulaForm — extended context', () => {
  it('makes __formData__ available when x-formula-context is extended', () => {
    const MockForm = vi.fn(() => <div />)
    const schema = {
      type: 'object',
      properties: {
        tax: { type: 'number' },
        subtotal: { type: 'number' },
        total: {
          type: 'number',
          'x-formula': '__formData__.tax + __formData__.subtotal',
          'x-formula-context': 'extended',
        },
      },
    }
    render(
      <FormulaForm
        schema={schema as any}
        formData={{ tax: 5, subtotal: 100, total: 0 }}
        validator={validator}
        evaluator={evalSimple}
        onChange={vi.fn()}
        Form={MockForm as any}
      />
    )
    const received = MockForm.mock.calls[0][0].formData
    expect(received.total).toBe(105)
  })

  it('uses custom formulaDataKey when provided', () => {
    const MockForm = vi.fn(() => <div />)
    const schema = {
      type: 'object',
      properties: {
        tax: { type: 'number' },
        subtotal: { type: 'number' },
        total: {
          type: 'number',
          'x-formula': 'fd.tax + fd.subtotal',
          'x-formula-context': 'extended',
        },
      },
    }
    render(
      <FormulaForm
        schema={schema as any}
        formData={{ tax: 5, subtotal: 100, total: 0 }}
        validator={validator}
        evaluator={evalSimple}
        onChange={vi.fn()}
        formulaDataKey="fd"
        Form={MockForm as any}
      />
    )
    const received = MockForm.mock.calls[0][0].formData
    expect(received.total).toBe(105)
  })

  it('uses custom formulaPathKey when provided', () => {
    const MockForm = vi.fn(() => <div />)
    const capturedContexts: object[] = []
    const capturingEval = (formula: string, ctx: object) => {
      capturedContexts.push(ctx)
      return evalSimple(formula, ctx)
    }
    const schema = {
      type: 'object',
      properties: {
        a: { type: 'number' },
        b: {
          type: 'number',
          'x-formula': 'a * 2',
          'x-formula-context': 'extended',
        },
      },
    }
    render(
      <FormulaForm
        schema={schema as any}
        formData={{ a: 3, b: 0 }}
        validator={validator}
        evaluator={capturingEval}
        onChange={vi.fn()}
        formulaPathKey="myPath"
        Form={MockForm as any}
      />
    )
    const ctx = capturedContexts[0] as any
    expect(ctx.myPath).toEqual(['b'])
    expect(ctx.__path__).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to see them fail**

```bash
bun run test
```

Expected: 3 failures — `formulaDataKey` and `formulaPathKey` props are not yet on `FormulaForm`, so custom key tests fail, and the extended context test also fails because `enrich` isn't receiving the keys from props yet.

- [ ] **Step 3: Update `src/FormulaForm.tsx`**

In `src/FormulaForm.tsx`, make two changes:

**Change 1** — Add the two new optional props to `FormulaFormProps`:

```typescript
export type FormulaFormProps<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any
> = FormProps<T, S, F> & {
  evaluator: (formula: string, context: object) => unknown
  Form?: React.ComponentType<FormProps<T, S, F>>
  formulaKey?: string
  formulaContextKey?: string
  formulaDataKey?: string   // default: '__formData__'
  formulaPathKey?: string   // default: '__path__'
  maxConvergencePasses?: number
  onFormulaError?: (path: (string | number)[], error: Error) => void
}
```

**Change 2** — Destructure the new props (with defaults) and pass them to both `enrich` calls. Replace the destructuring block and both `enrich` usages:

```typescript
  const {
    schema,
    formData,
    uiSchema,
    evaluator,
    Form: InnerForm = Form as React.ComponentType<FormProps<T, S, F>>,
    formulaKey = 'x-formula',
    formulaContextKey = 'x-formula-context',
    formulaDataKey = '__formData__',
    formulaPathKey = '__path__',
    maxConvergencePasses = 10,
    onFormulaError,
    onChange,
    ...rest
  } = props

  // ...

  const enrichedFormData = useMemo(
    () => enrich(formData, formulaFields, evaluator, maxConvergencePasses, onFormulaError, formulaDataKey, formulaPathKey) as T,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [formData, formulaFields, evaluator, maxConvergencePasses, formulaDataKey, formulaPathKey]
  )

  // ... (mergedUiSchema and useEffect stay the same) ...

  const handleChange = (data: IChangeEvent<T, S, F>, id?: string) => {
    const enriched = enrich(data.formData, formulaFields, evaluator, maxConvergencePasses, onFormulaError, formulaDataKey, formulaPathKey) as T
    onChange?.({ ...data, formData: enriched }, id)
  }
```

- [ ] **Step 4: Run tests to see them pass**

```bash
bun run test --reporter=verbose
```

Expected: all tests pass in all four projects including the three new extended context tests.

- [ ] **Step 5: Commit**

```bash
git add src/FormulaForm.tsx tests/FormulaForm.test.tsx
git commit -m "feat: add formulaDataKey and formulaPathKey props to FormulaForm"
```

---

### Task 4: Export and final verification

**Files:**
- Modify: `src/index.ts`

`BuildContextOptions` is an internal type — it does not need to be re-exported from the public index.

- [ ] **Step 1: Verify `src/index.ts` needs no changes**

Check `src/index.ts`. It currently exports `FormulaForm` and `FormulaFormProps` from `./FormulaForm`. The new props (`formulaDataKey`, `formulaPathKey`) are already part of `FormulaFormProps` after Task 3 — no index changes required.

```bash
grep -n 'FormulaForm' src/index.ts
```

Expected: `FormulaForm` and `FormulaFormProps` are already exported.

- [ ] **Step 2: Build and run publint**

```bash
bun run build && bunx publint
```

Expected: build succeeds, `bunx publint` reports no issues.

- [ ] **Step 3: Run full test suite**

```bash
bun run test --reporter=verbose
```

Expected: all tests pass across all four Vitest projects (`rjsf-v6`, `rjsf-v5`, `rjsf-v6-react`, `rjsf-v5-react`).

- [ ] **Step 4: Commit if index.ts was changed**

If Step 1 revealed a gap, add missing exports and commit:

```bash
git add src/index.ts
git commit -m "chore: verify index.ts exports after issue-04 changes"
```

---

## Final verification

```bash
bun run build
```
→ `dist/index.mjs`, `dist/index.cjs`, `dist/index.d.mts`, `dist/index.d.cts` all present.

```bash
bun run test
```
→ All tests pass across all four Vitest projects.

```bash
bunx publint
```
→ `✔ No issues found`
