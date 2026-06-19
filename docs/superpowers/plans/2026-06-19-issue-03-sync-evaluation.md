# Issue 03 — FormulaForm Sync Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `FormulaForm`, a drop-in RJSF `<Form>` replacement that intercepts `onChange`, runs a sync convergence loop over computed fields, and passes enriched `formData` both to the inner form and the parent.

**Architecture:** Three source files — `src/enrich.ts` (data mutation, convergence loop), `src/mergeReadOnly.ts` (uiSchema injection), `src/FormulaForm.tsx` (React wrapper). `FormulaForm` holds no local state; everything is derived from props via `useMemo`. The `enrich` function runs synchronously, making it safe to call inside `useMemo`.

**Tech Stack:** React, TypeScript, `@rjsf/core`, `@rjsf/utils`, Vitest + `@testing-library/react` + `jsdom` (tests), `fast-deep-equal` (deep equality in convergence loop).

**Spec:** `docs/superpowers/specs/2026-06-19-issue-03-sync-evaluation-design.md`

**Depends on:** Issue 02 (`analyzeSchema`, `ARRAY_INDEX`, `FormulaField` must be in place).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/enrich.ts` | Create | `getAt`, `setAt`, `expandPaths`, `buildContext`, `applyAllFormulas`, `enrich`, `deepEqual` |
| `src/mergeReadOnly.ts` | Create | `mergeReadOnly` — translate `FormulaField` paths to RJSF uiSchema read-only entries |
| `src/FormulaForm.tsx` | Create | React component — `useMemo` derivations, mount effect, `onChange` interception |
| `src/index.ts` | Modify | Re-export `FormulaForm` and `FormulaFormProps` |
| `tests/enrich.test.ts` | Create | Unit tests for enrich utilities and convergence loop |
| `tests/mergeReadOnly.test.ts` | Create | Unit tests for uiSchema path translation |
| `tests/FormulaForm.test.tsx` | Create | React integration tests using Testing Library |
| `vitest.config.ts` | Modify | Add `jsdom` environment for `.tsx` test files |
| `package.json` | Modify | Add `@testing-library/react`, `@testing-library/jest-dom`, `fast-deep-equal` as devDeps |

---

### Task 1: Install test dependencies and configure jsdom

**Files:**
- Modify: `package.json`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Add devDependencies**

```bash
bun add -D @testing-library/react @testing-library/jest-dom fast-deep-equal @types/fast-deep-equal
```

Expected: packages appear in `node_modules/`, `package.json` devDependencies updated.

- [ ] **Step 2: Update vitest.config.ts to add jsdom environment for .tsx files**

Replace the contents of `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'rjsf-v6',
          include: ['tests/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'rjsf-v6-react',
          include: ['tests/**/*.test.tsx'],
          environment: 'jsdom',
        },
      },
      {
        test: {
          name: 'rjsf-v5',
          include: ['tests/**/*.test.ts'],
          environment: 'node',
        },
        resolve: {
          alias: {
            '@rjsf/core': 'rjsf-core-v5',
            '@rjsf/utils': 'rjsf-utils-v5',
          },
        },
      },
      {
        test: {
          name: 'rjsf-v5-react',
          include: ['tests/**/*.test.tsx'],
          environment: 'jsdom',
        },
        resolve: {
          alias: {
            '@rjsf/core': 'rjsf-core-v5',
            '@rjsf/utils': 'rjsf-utils-v5',
          },
        },
      },
    ],
  },
})
```

- [ ] **Step 3: Verify existing tests still pass**

```bash
bun run test
```

Expected: all existing tests pass in all four projects.

- [ ] **Step 4: Commit**

```bash
git add package.json vitest.config.ts bun.lockb
git commit -m "chore: add testing-library/react, jsdom env, fast-deep-equal"
```

---

### Task 2: Enrich utilities (getAt, setAt, expandPaths, buildContext)

**Files:**
- Create: `src/enrich.ts`
- Create: `tests/enrich.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/enrich.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { getAt, setAt, expandPaths, buildContext, ARRAY_INDEX } from '../src/enrich'

describe('getAt', () => {
  it('retrieves a nested value', () => {
    expect(getAt({ a: { b: 42 } }, ['a', 'b'])).toBe(42)
  })

  it('retrieves an array element', () => {
    expect(getAt({ items: [{ x: 1 }] }, ['items', 0, 'x'])).toBe(1)
  })

  it('returns undefined for missing paths', () => {
    expect(getAt({ a: 1 }, ['b', 'c'])).toBeUndefined()
  })

  it('returns the root when path is empty', () => {
    const data = { a: 1 }
    expect(getAt(data, [])).toBe(data)
  })
})

describe('setAt', () => {
  it('sets a nested value', () => {
    const data = { a: { b: 1 } }
    setAt(data, ['a', 'b'], 99)
    expect(data.a.b).toBe(99)
  })

  it('sets an array element', () => {
    const data = { items: [{ x: 1 }] }
    setAt(data, ['items', 0, 'x'], 42)
    expect(data.items[0].x).toBe(42)
  })
})

describe('expandPaths', () => {
  it('returns path unchanged when no ARRAY_INDEX', () => {
    const paths = expandPaths(['a', 'b'], { a: { b: 1 } })
    expect(paths).toEqual([['a', 'b']])
  })

  it('expands ARRAY_INDEX to concrete indices', () => {
    const data = { items: [{ total: 0 }, { total: 0 }] }
    const paths = expandPaths(['items', ARRAY_INDEX, 'total'], data)
    expect(paths).toEqual([['items', 0, 'total'], ['items', 1, 'total']])
  })

  it('returns empty array when the target array is empty', () => {
    const paths = expandPaths(['items', ARRAY_INDEX, 'total'], { items: [] })
    expect(paths).toEqual([])
  })

  it('expands nested ARRAY_INDEX', () => {
    const data = { matrix: [[{ v: 0 }], [{ v: 0 }, { v: 0 }]] }
    const paths = expandPaths(['matrix', ARRAY_INDEX, ARRAY_INDEX, 'v'], data)
    expect(paths).toEqual([
      ['matrix', 0, 0, 'v'],
      ['matrix', 1, 0, 'v'],
      ['matrix', 1, 1, 'v'],
    ])
  })
})

describe('buildContext', () => {
  it('returns sibling fields of the target', () => {
    const data = { price: 10, quantity: 3, total: 0 }
    const ctx = buildContext(data, ['total'])
    expect(ctx).toEqual({ price: 10, quantity: 3, total: 0 })
  })

  it('returns siblings for a nested field', () => {
    const data = { order: { price: 5, quantity: 2, total: 0 } }
    const ctx = buildContext(data, ['order', 'total'])
    expect(ctx).toEqual({ price: 5, quantity: 2, total: 0 })
  })
})
```

- [ ] **Step 2: Run tests to see them fail**

```bash
bun run test
```

Expected: failures because `src/enrich.ts` does not exist.

- [ ] **Step 3: Implement the utilities**

Create `src/enrich.ts`:

```typescript
import equal from 'fast-deep-equal'
import type { FormulaField, ArrayIndex } from './analyzeSchema'
import { ARRAY_INDEX } from './analyzeSchema'

export { ARRAY_INDEX }

export function getAt(data: unknown, path: (string | number)[]): unknown {
  return path.reduce<unknown>((curr, key) => {
    if (curr == null || typeof curr !== 'object') return undefined
    return (curr as Record<string | number, unknown>)[key]
  }, data)
}

export function setAt(data: unknown, path: (string | number)[], value: unknown): void {
  if (path.length === 0) return
  const parent = getAt(data, path.slice(0, -1))
  if (parent != null && typeof parent === 'object') {
    ;(parent as Record<string | number, unknown>)[path[path.length - 1]] = value
  }
}

export function expandPaths(
  templatePath: (string | number | ArrayIndex)[],
  data: unknown,
  currentPath: (string | number)[] = []
): (string | number)[][] {
  if (templatePath.length === 0) return [currentPath]

  const [head, ...rest] = templatePath

  if (head === ARRAY_INDEX) {
    const arr = getAt(data, currentPath)
    if (!Array.isArray(arr)) return []
    const results: (string | number)[][] = []
    for (let i = 0; i < arr.length; i++) {
      results.push(...expandPaths(rest, data, [...currentPath, i]))
    }
    return results
  }

  return expandPaths(rest, data, [...currentPath, head as string | number])
}

export function buildContext(data: unknown, path: (string | number)[]): object {
  const parentPath = path.slice(0, -1)
  const parent = getAt(data, parentPath)
  if (parent != null && typeof parent === 'object' && !Array.isArray(parent)) {
    return { ...(parent as object) }
  }
  return {}
}

export function deepEqual(a: unknown, b: unknown): boolean {
  return equal(a, b)
}
```

- [ ] **Step 4: Run tests to see them pass**

```bash
bun run test --reporter=verbose
```

Expected: all enrich utility tests pass in all four projects.

- [ ] **Step 5: Commit**

```bash
git add src/enrich.ts tests/enrich.test.ts
git commit -m "feat: add enrich utilities (getAt, setAt, expandPaths, buildContext)"
```

---

### Task 3: applyAllFormulas and enrich (convergence loop)

**Files:**
- Modify: `src/enrich.ts`
- Modify: `tests/enrich.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/enrich.test.ts`:

```typescript
import { enrich } from '../src/enrich'
import type { FormulaField } from '../src/analyzeSchema'

const evalSimple = (formula: string, ctx: object) =>
  // Safe for tests only: evaluates formula string with context as local variables
  new Function(...Object.keys(ctx), `return ${formula}`)(...Object.values(ctx))

describe('enrich', () => {
  it('evaluates a single formula and returns enriched formData', () => {
    const fields: FormulaField[] = [
      { path: ['total'], formula: 'price * quantity', contextMode: 'siblings' },
    ]
    const result = enrich({ price: 10, quantity: 3, total: 0 }, fields, evalSimple, 10, undefined)
    expect(result).toEqual({ price: 10, quantity: 3, total: 30 })
  })

  it('returns formData unchanged when no formula fields', () => {
    const data = { a: 1 }
    expect(enrich(data, [], evalSimple, 10, undefined)).toBe(data)
  })

  it('evaluates formulas for each array element independently', () => {
    const fields: FormulaField[] = [
      { path: ['items', ARRAY_INDEX, 'total'], formula: 'price * quantity', contextMode: 'siblings' },
    ]
    const data = {
      items: [
        { price: 10, quantity: 2, total: 0 },
        { price: 5, quantity: 4, total: 0 },
      ],
    }
    const result = enrich(data, fields, evalSimple, 10, undefined) as typeof data
    expect(result.items[0].total).toBe(20)
    expect(result.items[1].total).toBe(20)
  })

  it('converges when a computed field references another computed field', () => {
    const fields: FormulaField[] = [
      { path: ['double'], formula: 'base * 2', contextMode: 'siblings' },
      { path: ['quad'], formula: 'double * 2', contextMode: 'siblings' },
    ]
    const result = enrich({ base: 5, double: 0, quad: 0 }, fields, evalSimple, 10, undefined) as any
    expect(result.double).toBe(10)
    expect(result.quad).toBe(20)
  })

  it('calls onFormulaError and sets field to undefined when evaluator throws', () => {
    const fields: FormulaField[] = [
      { path: ['bad'], formula: 'throw new Error("boom")', contextMode: 'siblings' },
      { path: ['good'], formula: 'a + 1', contextMode: 'siblings' },
    ]
    const errors: Array<{ path: (string | number)[]; error: Error }> = []
    const result = enrich(
      { a: 1, bad: 0, good: 0 },
      fields,
      evalSimple,
      10,
      (path, error) => errors.push({ path, error })
    ) as any
    expect(result.bad).toBeUndefined()
    expect(result.good).toBe(2)
    expect(errors).toHaveLength(1)
    expect(errors[0].path).toEqual(['bad'])
  })

  it('calls onFormulaError and sets field to undefined on convergence failure', () => {
    const fields: FormulaField[] = [
      { path: ['x'], formula: 'x + 1', contextMode: 'siblings' }, // never converges
    ]
    const errors: Array<{ path: (string | number)[]; error: Error }> = []
    const result = enrich(
      { x: 0 },
      fields,
      evalSimple,
      3,
      (path, error) => errors.push({ path, error })
    ) as any
    expect(result.x).toBeUndefined()
    expect(errors).toHaveLength(1)
    expect(errors[0].error.message).toMatch(/did not converge/)
  })
})
```

- [ ] **Step 2: Run tests to see them fail**

```bash
bun run test
```

Expected: failures — `enrich` is not exported yet.

- [ ] **Step 3: Implement applyAllFormulas and enrich**

Append to `src/enrich.ts`:

```typescript
function applyAllFormulas(
  formData: unknown,
  formulaFields: FormulaField[],
  evaluator: (formula: string, context: object) => unknown,
  onFormulaError: ((path: (string | number)[], error: Error) => void) | undefined
): unknown {
  const result = structuredClone(formData)

  for (const field of formulaFields) {
    for (const concretePath of expandPaths(field.path, result)) {
      try {
        const context = buildContext(result, concretePath)
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

function allConverged(
  prev: unknown,
  next: unknown,
  formulaFields: FormulaField[]
): boolean {
  for (const field of formulaFields) {
    for (const concretePath of expandPaths(field.path, next)) {
      if (!deepEqual(getAt(prev, concretePath), getAt(next, concretePath))) {
        return false
      }
    }
  }
  return true
}

export function enrich(
  formData: unknown,
  formulaFields: FormulaField[],
  evaluator: (formula: string, context: object) => unknown,
  maxConvergencePasses: number,
  onFormulaError: ((path: (string | number)[], error: Error) => void) | undefined
): unknown {
  if (formulaFields.length === 0) return formData

  let current = formData

  for (let pass = 0; pass < maxConvergencePasses; pass++) {
    const candidate = applyAllFormulas(current, formulaFields, evaluator, onFormulaError)
    if (allConverged(current, candidate, formulaFields)) return candidate
    current = candidate
  }

  // maxConvergencePasses exceeded — identify and report non-converging fields
  const candidate = applyAllFormulas(current, formulaFields, evaluator, onFormulaError)
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

Expected: all enrich tests pass in all four projects.

- [ ] **Step 5: Commit**

```bash
git add src/enrich.ts tests/enrich.test.ts
git commit -m "feat: implement applyAllFormulas and convergence loop in enrich"
```

---

### Task 4: mergeReadOnly

**Files:**
- Create: `src/mergeReadOnly.ts`
- Create: `tests/mergeReadOnly.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/mergeReadOnly.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { mergeReadOnly } from '../src/mergeReadOnly'
import { ARRAY_INDEX } from '../src/analyzeSchema'
import type { FormulaField } from '../src/analyzeSchema'

describe('mergeReadOnly', () => {
  it('sets ui:readonly on a flat computed field', () => {
    const fields: FormulaField[] = [
      { path: ['total'], formula: 'a + b', contextMode: 'siblings' },
    ]
    const result = mergeReadOnly(undefined, fields)
    expect(result).toEqual({ total: { 'ui:readonly': true } })
  })

  it('sets ui:readonly on a nested computed field', () => {
    const fields: FormulaField[] = [
      { path: ['order', 'total'], formula: 'a + b', contextMode: 'siblings' },
    ]
    const result = mergeReadOnly(undefined, fields)
    expect(result).toEqual({ order: { total: { 'ui:readonly': true } } })
  })

  it('preserves existing uiSchema entries', () => {
    const fields: FormulaField[] = [
      { path: ['total'], formula: 'a + b', contextMode: 'siblings' },
    ]
    const existing = { price: { 'ui:widget': 'updown' } }
    const result = mergeReadOnly(existing, fields)
    expect(result).toEqual({
      price: { 'ui:widget': 'updown' },
      total: { 'ui:readonly': true },
    })
  })

  it('uses items object for ARRAY_INDEX (uniform array)', () => {
    const fields: FormulaField[] = [
      { path: ['rows', ARRAY_INDEX, 'total'], formula: 'a * b', contextMode: 'siblings' },
    ]
    const result = mergeReadOnly(undefined, fields)
    expect(result).toEqual({
      rows: { items: { total: { 'ui:readonly': true } } },
    })
  })

  it('uses items array for prefixItems (tuple slot)', () => {
    const fields: FormulaField[] = [
      { path: ['tuple', 2], formula: 'a + b', contextMode: 'siblings' },
    ]
    const result = mergeReadOnly(undefined, fields)
    expect(result).toEqual({
      tuple: { items: [undefined, undefined, { 'ui:readonly': true }] },
    })
  })

  it('uses items array + additionalItems when both integers and ARRAY_INDEX share an array', () => {
    const fields: FormulaField[] = [
      { path: ['mixed', 1], formula: 'a + b', contextMode: 'siblings' },
      { path: ['mixed', ARRAY_INDEX, 'total'], formula: 'x * y', contextMode: 'siblings' },
    ]
    const result = mergeReadOnly(undefined, fields)
    expect(result).toEqual({
      mixed: {
        items: [undefined, { 'ui:readonly': true }],
        additionalItems: { total: { 'ui:readonly': true } },
      },
    })
  })
})
```

- [ ] **Step 2: Run tests to see them fail**

```bash
bun run test
```

Expected: failures — `src/mergeReadOnly.ts` does not exist.

- [ ] **Step 3: Implement mergeReadOnly**

Create `src/mergeReadOnly.ts`:

```typescript
import type { FormulaField, ArrayIndex } from './analyzeSchema'
import { ARRAY_INDEX } from './analyzeSchema'

type UiSchema = Record<string, unknown>

export function mergeReadOnly(
  uiSchema: UiSchema | undefined,
  formulaFields: FormulaField[]
): UiSchema {
  const result: UiSchema = { ...(uiSchema ?? {}) }
  const mixedArrayPaths = findMixedArrayPaths(formulaFields)

  for (const field of formulaFields) {
    setReadOnly(result, field.path, mixedArrayPaths)
  }

  return result
}

// Returns a set of serialized parent paths for arrays that have both integer
// (prefixItems) and ARRAY_INDEX (items) formula fields at the same depth.
function findMixedArrayPaths(formulaFields: FormulaField[]): Set<string> {
  const mixed = new Set<string>()

  for (let i = 0; i < formulaFields.length; i++) {
    const path = formulaFields[i].path

    for (let depth = 0; depth < path.length; depth++) {
      const seg = path[depth]
      if (typeof seg !== 'number' && seg !== ARRAY_INDEX) continue

      const parentKey = serializePath(path.slice(0, depth))
      const isInt = typeof seg === 'number'

      const hasSibling = formulaFields.some((f, j) => {
        if (j === i) return false
        if (f.path.length <= depth) return false
        if (serializePath(f.path.slice(0, depth)) !== parentKey) return false
        const sibling = f.path[depth]
        return isInt ? sibling === ARRAY_INDEX : typeof sibling === 'number'
      })

      if (hasSibling) mixed.add(parentKey)
    }
  }

  return mixed
}

function serializePath(path: (string | number | ArrayIndex)[]): string {
  return JSON.stringify(path.map(s => (typeof s === 'symbol' ? '__ARRAY_INDEX__' : s)))
}

function setReadOnly(
  uiSchema: UiSchema,
  path: (string | number | ArrayIndex)[],
  mixedArrayPaths: Set<string>,
  traversedPath: (string | number | ArrayIndex)[] = []
): void {
  if (path.length === 0) {
    uiSchema['ui:readonly'] = true
    return
  }

  const [head, ...tail] = path

  if (typeof head === 'string') {
    if (!uiSchema[head] || typeof uiSchema[head] !== 'object' || Array.isArray(uiSchema[head])) {
      uiSchema[head] = {}
    }
    setReadOnly(uiSchema[head] as UiSchema, tail, mixedArrayPaths, [...traversedPath, head])
    return
  }

  if (typeof head === 'number') {
    // prefixItems tuple slot — use items as array
    if (!Array.isArray(uiSchema['items'])) {
      uiSchema['items'] = []
    }
    const items = uiSchema['items'] as unknown[]
    if (!items[head] || typeof items[head] !== 'object') {
      items[head] = {}
    }
    setReadOnly(items[head] as UiSchema, tail, mixedArrayPaths, [...traversedPath, head])
    return
  }

  // head === ARRAY_INDEX
  const parentKey = serializePath(traversedPath)
  const isMixed = mixedArrayPaths.has(parentKey)

  if (isMixed) {
    // Mixed array: ARRAY_INDEX → additionalItems
    if (!uiSchema['additionalItems'] || typeof uiSchema['additionalItems'] !== 'object') {
      uiSchema['additionalItems'] = {}
    }
    setReadOnly(uiSchema['additionalItems'] as UiSchema, tail, mixedArrayPaths, [...traversedPath, head])
  } else {
    // Uniform array: ARRAY_INDEX → items as object
    if (!uiSchema['items'] || typeof uiSchema['items'] !== 'object' || Array.isArray(uiSchema['items'])) {
      uiSchema['items'] = {}
    }
    setReadOnly(uiSchema['items'] as UiSchema, tail, mixedArrayPaths, [...traversedPath, head])
  }
}
```

> **Implementation note:** The `additionalItems` key for the mixed-array case should be verified against RJSF v5 and v6 source. If RJSF uses a different key in one version, add a version-specific branch here.

- [ ] **Step 4: Run tests to see them pass**

```bash
bun run test --reporter=verbose
```

Expected: all `mergeReadOnly` tests pass in all four projects.

- [ ] **Step 5: Commit**

```bash
git add src/mergeReadOnly.ts tests/mergeReadOnly.test.ts
git commit -m "feat: implement mergeReadOnly uiSchema injection"
```

---

### Task 5: FormulaForm component

**Files:**
- Create: `src/FormulaForm.tsx`
- Create: `tests/FormulaForm.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `tests/FormulaForm.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import React from 'react'
import Form from '@rjsf/core'
import validator from '@rjsf/validator-ajv8'
import { FormulaForm } from '../src/FormulaForm'

// Safe eval for tests only
const evalSimple = (formula: string, ctx: object) =>
  new Function(...Object.keys(ctx), `return ${formula}`)(...Object.values(ctx))

describe('FormulaForm — mount', () => {
  it('fires parent onChange with enriched formData on mount', () => {
    const onChange = vi.fn()
    const schema = {
      type: 'object',
      properties: {
        price: { type: 'number' },
        quantity: { type: 'number' },
        total: { type: 'number', 'x-formula': 'price * quantity' },
      },
    }
    act(() => {
      render(
        <FormulaForm
          schema={schema as any}
          formData={{ price: 10, quantity: 3, total: 0 }}
          validator={validator}
          evaluator={evalSimple}
          onChange={onChange}
        />
      )
    })
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ formData: { price: 10, quantity: 3, total: 30 } }),
      undefined
    )
  })
})

describe('FormulaForm — onChange', () => {
  it('passes enriched formData to parent onChange on user edit', async () => {
    const onChange = vi.fn()
    const schema = {
      type: 'object',
      properties: {
        price: { type: 'number' },
        quantity: { type: 'number' },
        total: { type: 'number', 'x-formula': 'price * quantity' },
      },
    }

    // Use a mock inner Form to simulate an onChange call
    const MockForm = vi.fn(({ onChange: innerOnChange }: any) => {
      return (
        <button
          onClick={() =>
            innerOnChange({ formData: { price: 5, quantity: 4, total: 0 } })
          }
        >
          change
        </button>
      )
    })

    const { getByText } = render(
      <FormulaForm
        schema={schema as any}
        formData={{ price: 10, quantity: 3, total: 0 }}
        validator={validator}
        evaluator={evalSimple}
        onChange={onChange}
        Form={MockForm as any}
      />
    )

    act(() => {
      getByText('change').click()
    })

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ formData: { price: 5, quantity: 4, total: 20 } }),
      undefined
    )
  })
})

describe('FormulaForm — custom Form prop', () => {
  it('renders a custom Form component when provided', () => {
    const MockForm = vi.fn(() => <div data-testid="custom-form" />)
    const schema = { type: 'object', properties: {} }
    const { getByTestId } = render(
      <FormulaForm
        schema={schema as any}
        formData={{}}
        validator={validator}
        evaluator={evalSimple}
        onChange={vi.fn()}
        Form={MockForm as any}
      />
    )
    expect(getByTestId('custom-form')).toBeTruthy()
    expect(MockForm).toHaveBeenCalled()
  })
})

describe('FormulaForm — read-only injection', () => {
  it('passes mergedUiSchema with ui:readonly on computed fields to the inner Form', () => {
    const MockForm = vi.fn(() => <div />)
    const schema = {
      type: 'object',
      properties: {
        a: { type: 'number' },
        total: { type: 'number', 'x-formula': 'a * 2' },
      },
    }
    render(
      <FormulaForm
        schema={schema as any}
        formData={{ a: 1, total: 0 }}
        validator={validator}
        evaluator={evalSimple}
        onChange={vi.fn()}
        Form={MockForm as any}
      />
    )
    const receivedUiSchema = MockForm.mock.calls[0][0].uiSchema
    expect(receivedUiSchema?.total?.['ui:readonly']).toBe(true)
  })

  it('preserves user-supplied uiSchema entries alongside injected read-only', () => {
    const MockForm = vi.fn(() => <div />)
    const schema = {
      type: 'object',
      properties: {
        a: { type: 'number' },
        total: { type: 'number', 'x-formula': 'a * 2' },
      },
    }
    const uiSchema = { a: { 'ui:widget': 'updown' } }
    render(
      <FormulaForm
        schema={schema as any}
        formData={{ a: 1, total: 0 }}
        uiSchema={uiSchema}
        validator={validator}
        evaluator={evalSimple}
        onChange={vi.fn()}
        Form={MockForm as any}
      />
    )
    const received = MockForm.mock.calls[0][0].uiSchema
    expect(received?.a?.['ui:widget']).toBe('updown')
    expect(received?.total?.['ui:readonly']).toBe(true)
  })
})

describe('FormulaForm — nested objects', () => {
  it('enriches a computed field nested inside an object', () => {
    const MockForm = vi.fn(() => <div />)
    const schema = {
      type: 'object',
      properties: {
        order: {
          type: 'object',
          properties: {
            price: { type: 'number' },
            quantity: { type: 'number' },
            total: { type: 'number', 'x-formula': 'price * quantity' },
          },
        },
      },
    }
    render(
      <FormulaForm
        schema={schema as any}
        formData={{ order: { price: 4, quantity: 5, total: 0 } }}
        validator={validator}
        evaluator={evalSimple}
        onChange={vi.fn()}
        Form={MockForm as any}
      />
    )
    const received = MockForm.mock.calls[0][0].formData
    expect(received.order.total).toBe(20)
  })
})

describe('FormulaForm — custom keys', () => {
  it('uses a custom formulaKey to detect computed fields', () => {
    const MockForm = vi.fn(() => <div />)
    const schema = {
      type: 'object',
      properties: {
        a: { type: 'number' },
        b: { type: 'number', 'x-calc': 'a * 3' },
      },
    }
    render(
      <FormulaForm
        schema={schema as any}
        formData={{ a: 4, b: 0 }}
        validator={validator}
        evaluator={evalSimple}
        onChange={vi.fn()}
        formulaKey="x-calc"
        Form={MockForm as any}
      />
    )
    const received = MockForm.mock.calls[0][0].formData
    expect(received.b).toBe(12)
  })
})

describe('FormulaForm — error handling', () => {
  it('calls onFormulaError and sets field to undefined when evaluator throws', () => {
    const MockForm = vi.fn(() => <div />)
    const onFormulaError = vi.fn()
    const schema = {
      type: 'object',
      properties: {
        a: { type: 'number' },
        bad: { type: 'number', 'x-formula': 'throw_error' },
        good: { type: 'number', 'x-formula': 'a + 1' },
      },
    }
    const brokenEval = (formula: string, ctx: object) => {
      if (formula === 'throw_error') throw new Error('boom')
      return evalSimple(formula, ctx)
    }
    render(
      <FormulaForm
        schema={schema as any}
        formData={{ a: 5, bad: 0, good: 0 }}
        validator={validator}
        evaluator={brokenEval}
        onChange={vi.fn()}
        onFormulaError={onFormulaError}
        Form={MockForm as any}
      />
    )
    const received = MockForm.mock.calls[0][0].formData
    expect(received.bad).toBeUndefined()
    expect(received.good).toBe(6)
    expect(onFormulaError).toHaveBeenCalledWith(['bad'], expect.any(Error))
  })
})
```

- [ ] **Step 2: Add @rjsf/validator-ajv8**

```bash
bun add -D @rjsf/validator-ajv8
```

Expected: `@rjsf/validator-ajv8` appears in devDependencies and `node_modules/`.

- [ ] **Step 3: Run tests to see them fail**

```bash
bun run test
```

Expected: failures — `src/FormulaForm.tsx` does not exist.

- [ ] **Step 4: Implement FormulaForm**

Create `src/FormulaForm.tsx`:

```typescript
import React, { useMemo, useEffect } from 'react'
import Form from '@rjsf/core'
import type { FormProps, IChangeEvent, StrictRJSFSchema, RJSFSchema, FormContextType } from '@rjsf/utils'
import { analyzeSchema } from './analyzeSchema'
import type { FormulaField } from './analyzeSchema'
import { enrich } from './enrich'
import { mergeReadOnly } from './mergeReadOnly'

export type FormulaFormProps<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any
> = FormProps<T, S, F> & {
  evaluator: (formula: string, context: object) => unknown
  Form?: React.ComponentType<FormProps<T, S, F>>
  formulaKey?: string
  formulaContextKey?: string
  maxConvergencePasses?: number
  onFormulaError?: (path: (string | number)[], error: Error) => void
}

export function FormulaForm<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any
>(props: FormulaFormProps<T, S, F>): JSX.Element {
  const {
    schema,
    formData,
    uiSchema,
    evaluator,
    Form: InnerForm = Form as React.ComponentType<FormProps<T, S, F>>,
    formulaKey = 'x-formula',
    formulaContextKey = 'x-formula-context',
    maxConvergencePasses = 10,
    onFormulaError,
    onChange,
    ...rest
  } = props

  const formulaFields: FormulaField[] = useMemo(
    () => analyzeSchema(schema as RJSFSchema, { formulaKey, formulaContextKey }),
    [schema, formulaKey, formulaContextKey]
  )

  const enrichedFormData = useMemo(
    () => enrich(formData, formulaFields, evaluator, maxConvergencePasses, onFormulaError) as T,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [formData, formulaFields, evaluator, maxConvergencePasses]
  )

  const mergedUiSchema = useMemo(
    () => mergeReadOnly(uiSchema as Record<string, unknown> | undefined, formulaFields),
    [uiSchema, formulaFields]
  )

  useEffect(() => {
    // Empty deps: runs once on mount to push initial enriched values to the parent.
    onChange?.({ formData: enrichedFormData } as IChangeEvent<T, S, F>, undefined)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (data: IChangeEvent<T, S, F>, id?: string) => {
    const enriched = enrich(data.formData, formulaFields, evaluator, maxConvergencePasses, onFormulaError) as T
    onChange?.({ ...data, formData: enriched }, id)
  }

  return (
    <InnerForm
      {...rest}
      schema={schema}
      formData={enrichedFormData}
      uiSchema={mergedUiSchema as any}
      onChange={handleChange}
    />
  )
}
```

- [ ] **Step 5: Run tests to see them pass**

```bash
bun run test --reporter=verbose
```

Expected: all FormulaForm tests pass in both `rjsf-v6-react` and `rjsf-v5-react` projects.

If the mount `onChange` test fails, check that `useEffect` fires after `useMemo` — it always does in React, so `enrichedFormData` is available at effect time.

- [ ] **Step 6: Commit**

```bash
git add src/FormulaForm.tsx tests/FormulaForm.test.tsx package.json bun.lockb
git commit -m "feat: implement FormulaForm sync evaluation component"
```

---

### Task 6: Export from index.ts

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Update src/index.ts**

```typescript
export { analyzeSchema } from './analyzeSchema'
export type { ContextMode, FormulaField, AnalyzeSchemaOptions } from './analyzeSchema'

export { FormulaForm } from './FormulaForm'
export type { FormulaFormProps } from './FormulaForm'
```

- [ ] **Step 2: Build and verify**

```bash
bun run build && bunx publint
```

Expected: build succeeds with all four dist files, `bunx publint` reports no issues.

- [ ] **Step 3: Run full test suite**

```bash
bun run test
```

Expected: all tests pass in all four projects (`rjsf-v6`, `rjsf-v5`, `rjsf-v6-react`, `rjsf-v5-react`).

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: export FormulaForm and FormulaFormProps from index.ts"
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
