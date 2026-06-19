# Issue 02 — Schema Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `analyzeSchema`, a pure recursive function that traverses a JSON schema and returns descriptors for all computed fields (path, formula string, context mode).

**Architecture:** A single file `src/analyzeSchema.ts` exports the function plus its types. A private recursive `traverse` helper accumulates `FormulaField` entries. Test fixtures live in `tests/fixtures/schemas.ts` and are shared across issues 02–05.

**Tech Stack:** TypeScript, Vitest (runs tests against both RJSF v5 and v6 via multi-project config), `@rjsf/utils` (for `RJSFSchema` type only — no runtime RJSF calls).

**Spec:** `docs/superpowers/specs/2026-06-19-issue-02-schema-analysis-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/analyzeSchema.ts` | Create | Types, ARRAY_INDEX sentinel, `analyzeSchema`, private `traverse` |
| `tests/fixtures/schemas.ts` | Create | Shared plain-object schema fixtures for issues 02–05 |
| `tests/analyzeSchema.test.ts` | Create | Full test suite |

---

### Task 1: Types, sentinel, and function skeleton

**Files:**
- Create: `src/analyzeSchema.ts`

- [ ] **Step 1: Write the skeleton**

Create `src/analyzeSchema.ts`:

```typescript
import type { RJSFSchema } from '@rjsf/utils'

export const ARRAY_INDEX: unique symbol = Symbol('arrayIndex')
export type ArrayIndex = typeof ARRAY_INDEX

export type ContextMode = 'siblings' | 'extended'

export type FormulaField = {
  path: (string | number | ArrayIndex)[]
  formula: string
  contextMode: ContextMode
}

export type AnalyzeSchemaOptions = {
  formulaKey?: string
  formulaContextKey?: string
}

export function analyzeSchema(
  schema: RJSFSchema,
  options?: AnalyzeSchemaOptions
): FormulaField[] {
  const formulaKey = options?.formulaKey ?? 'x-formula'
  const formulaContextKey = options?.formulaContextKey ?? 'x-formula-context'
  const fields: FormulaField[] = []
  traverse(schema, [], fields, formulaKey, formulaContextKey)
  return fields
}

function traverse(
  _schema: RJSFSchema,
  _path: (string | number | ArrayIndex)[],
  _fields: FormulaField[],
  _formulaKey: string,
  _formulaContextKey: string
): void {
  // implementation added in tasks 3–8
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
bunx tsc --noEmit
```

Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add src/analyzeSchema.ts
git commit -m "feat: add analyzeSchema types and skeleton"
```

---

### Task 2: Shared schema fixtures

**Files:**
- Create: `tests/fixtures/schemas.ts`

- [ ] **Step 1: Write the fixtures file**

Create `tests/fixtures/schemas.ts`:

```typescript
// Plain objects — no test framework imports.
// Reused by tests for issues 02, 03, 04, 05.

export const flatWithOneFormula = {
  type: 'object',
  properties: {
    price: { type: 'number' },
    quantity: { type: 'number' },
    total: { type: 'number', 'x-formula': 'price * quantity' },
  },
} as const

export const flatWithMultipleFormulas = {
  type: 'object',
  properties: {
    a: { type: 'number' },
    b: { type: 'number' },
    sum: { type: 'number', 'x-formula': 'a + b' },
    product: { type: 'number', 'x-formula': 'a * b' },
  },
} as const

export const noFormulas = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    age: { type: 'number' },
  },
} as const

export const nestedObject = {
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
} as const

export const arrayWithItems = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          price: { type: 'number' },
          quantity: { type: 'number' },
          total: { type: 'number', 'x-formula': 'price * quantity' },
        },
      },
    },
  },
} as const

export const arrayWithPrefixItems = {
  type: 'object',
  properties: {
    tuple: {
      type: 'array',
      prefixItems: [
        { type: 'number' },
        { type: 'number' },
        { type: 'number', 'x-formula': 'tuple[0] + tuple[1]' },
      ],
    },
  },
} as const

export const arrayWithBoth = {
  type: 'object',
  properties: {
    mixed: {
      type: 'array',
      prefixItems: [
        { type: 'number' },
        { type: 'number', 'x-formula': 'a + b' },
      ],
      items: {
        type: 'object',
        properties: {
          value: { type: 'number' },
          doubled: { type: 'number', 'x-formula': 'value * 2' },
        },
      },
    },
  },
} as const

export const nestedArrays = {
  type: 'object',
  properties: {
    matrix: {
      type: 'array',
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            value: { type: 'number' },
            doubled: { type: 'number', 'x-formula': 'value * 2' },
          },
        },
      },
    },
  },
} as const

export const extendedContextSchema = {
  type: 'object',
  properties: {
    a: { type: 'number' },
    result: {
      type: 'number',
      'x-formula': '__formData__.a * 2',
      'x-formula-context': 'extended',
    },
  },
} as const

export const unknownContextSchema = {
  type: 'object',
  properties: {
    a: { type: 'number' },
    result: {
      type: 'number',
      'x-formula': 'a * 2',
      'x-formula-context': 'invalid-mode',
    },
  },
} as const

export const withOneOfSchema = {
  type: 'object',
  properties: { value: { type: 'number' } },
  oneOf: [
    { properties: { kind: { type: 'string', enum: ['a'] } } },
  ],
} as const
```

- [ ] **Step 2: Commit**

```bash
git add tests/fixtures/schemas.ts
git commit -m "test: add shared schema fixtures"
```

---

### Task 3: Flat object traversal

**Files:**
- Modify: `src/analyzeSchema.ts`
- Create: `tests/analyzeSchema.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/analyzeSchema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { analyzeSchema, ARRAY_INDEX } from '../src/analyzeSchema'
import * as fixtures from './fixtures/schemas'

describe('analyzeSchema — flat objects', () => {
  it('returns one FormulaField for a single computed field', () => {
    const result = analyzeSchema(fixtures.flatWithOneFormula as any)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      path: ['total'],
      formula: 'price * quantity',
      contextMode: 'siblings',
    })
  })

  it('returns multiple FormulaFields', () => {
    const result = analyzeSchema(fixtures.flatWithMultipleFormulas as any)
    expect(result).toHaveLength(2)
    expect(result.map(f => f.path)).toEqual([['sum'], ['product']])
  })

  it('returns empty array when no computed fields', () => {
    expect(analyzeSchema(fixtures.noFormulas as any)).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to see them fail**

```bash
bun run test
```

Expected: 3 failures with "expected [] to have length 1" (traverse is a no-op).

- [ ] **Step 3: Implement Rules 1 and 2 in traverse**

Replace the `traverse` stub in `src/analyzeSchema.ts`:

```typescript
const COMPOSITION_KEYS = ['$ref', 'oneOf', 'anyOf', 'allOf'] as const

function resolveContextMode(
  value: unknown,
  path: (string | number | ArrayIndex)[]
): ContextMode {
  if (value === undefined || value === 'siblings') return 'siblings'
  if (value === 'extended') return 'extended'
  console.warn(
    `[rjsf-formulas] Unknown x-formula-context value "${value}" at path [${formatPath(path)}], treating as "siblings"`
  )
  return 'siblings'
}

function formatPath(path: (string | number | ArrayIndex)[]): string {
  return path.map(s => (typeof s === 'symbol' ? '[*]' : String(s))).join(', ')
}

function traverse(
  schema: RJSFSchema,
  path: (string | number | ArrayIndex)[],
  fields: FormulaField[],
  formulaKey: string,
  formulaContextKey: string
): void {
  // Warn on composition operators (issue 06)
  for (const key of COMPOSITION_KEYS) {
    if (key in schema) {
      console.warn(
        `[rjsf-formulas] Schema composition operator "${key}" at path [${formatPath(path)}] is not supported and will be skipped. See issue 06.`
      )
    }
  }

  // Rule 1: computed field — record and stop
  if (formulaKey in schema) {
    fields.push({
      path,
      formula: (schema as Record<string, unknown>)[formulaKey] as string,
      contextMode: resolveContextMode(
        (schema as Record<string, unknown>)[formulaContextKey],
        path
      ),
    })
    return
  }

  // Rule 2: object — recurse into properties
  if (schema.type === 'object' && schema.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      traverse(
        propSchema as RJSFSchema,
        [...path, key],
        fields,
        formulaKey,
        formulaContextKey
      )
    }
  }
}
```

- [ ] **Step 4: Run tests to see them pass**

```bash
bun run test --reporter=verbose
```

Expected: all 3 flat object tests pass in both `rjsf-v6` and `rjsf-v5` projects.

- [ ] **Step 5: Commit**

```bash
git add src/analyzeSchema.ts tests/analyzeSchema.test.ts
git commit -m "feat: implement flat object traversal in analyzeSchema"
```

---

### Task 4: Nested objects

**Files:**
- Modify: `tests/analyzeSchema.test.ts`

- [ ] **Step 1: Write failing test**

Append to `tests/analyzeSchema.test.ts`:

```typescript
describe('analyzeSchema — nested objects', () => {
  it('recurses into nested objects', () => {
    const result = analyzeSchema(fixtures.nestedObject as any)
    expect(result).toHaveLength(1)
    expect(result[0].path).toEqual(['order', 'total'])
    expect(result[0].formula).toBe('price * quantity')
  })
})
```

- [ ] **Step 2: Run tests to see them pass immediately**

```bash
bun run test --reporter=verbose
```

Expected: nested object test passes — the recursive Rule 2 already handles this.

- [ ] **Step 3: Commit**

```bash
git add tests/analyzeSchema.test.ts
git commit -m "test: add nested object traversal test"
```

---

### Task 5: Array `items` traversal

**Files:**
- Modify: `src/analyzeSchema.ts`
- Modify: `tests/analyzeSchema.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/analyzeSchema.test.ts`:

```typescript
describe('analyzeSchema — array items', () => {
  it('uses ARRAY_INDEX sentinel for uniform array items', () => {
    const result = analyzeSchema(fixtures.arrayWithItems as any)
    expect(result).toHaveLength(1)
    expect(result[0].path).toEqual(['items', ARRAY_INDEX, 'total'])
  })
})
```

- [ ] **Step 2: Run tests to see them fail**

```bash
bun run test
```

Expected: 1 failure — `traverse` doesn't handle `type: 'array'` yet.

- [ ] **Step 3: Add Rule 3 to traverse**

In `src/analyzeSchema.ts`, add Rule 3 inside `traverse`, after Rule 2:

```typescript
  // Rule 3: array — recurse into prefixItems and/or items
  if (schema.type === 'array') {
    const schemaAny = schema as Record<string, unknown>

    // Rule 3a: prefixItems (tuple positions with static indices)
    if (Array.isArray(schemaAny['prefixItems'])) {
      const prefixItems = schemaAny['prefixItems'] as RJSFSchema[]
      prefixItems.forEach((itemSchema, index) => {
        traverse(itemSchema, [...path, index], fields, formulaKey, formulaContextKey)
      })
    }

    // Rule 3b: items (uniform array — all elements share one schema)
    if (schema.items && !Array.isArray(schema.items)) {
      traverse(
        schema.items as RJSFSchema,
        [...path, ARRAY_INDEX],
        fields,
        formulaKey,
        formulaContextKey
      )
    }
  }
```

- [ ] **Step 4: Run tests to see them pass**

```bash
bun run test --reporter=verbose
```

Expected: all tests pass in both projects.

- [ ] **Step 5: Commit**

```bash
git add src/analyzeSchema.ts tests/analyzeSchema.test.ts
git commit -m "feat: add array items traversal (ARRAY_INDEX sentinel)"
```

---

### Task 6: prefixItems, combined arrays, nested arrays

**Files:**
- Modify: `tests/analyzeSchema.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/analyzeSchema.test.ts`:

```typescript
describe('analyzeSchema — prefixItems and combined arrays', () => {
  it('uses integer indices for prefixItems tuple slots', () => {
    const result = analyzeSchema(fixtures.arrayWithPrefixItems as any)
    expect(result).toHaveLength(1)
    expect(result[0].path).toEqual(['tuple', 2])
    expect(result[0].formula).toBe('tuple[0] + tuple[1]')
  })

  it('handles both prefixItems and items in the same array', () => {
    const result = analyzeSchema(fixtures.arrayWithBoth as any)
    expect(result).toHaveLength(2)
    expect(result[0].path).toEqual(['mixed', 1])
    expect(result[1].path).toEqual(['mixed', ARRAY_INDEX, 'doubled'])
  })

  it('recurses into nested arrays', () => {
    const result = analyzeSchema(fixtures.nestedArrays as any)
    expect(result).toHaveLength(1)
    expect(result[0].path).toEqual(['matrix', ARRAY_INDEX, ARRAY_INDEX, 'doubled'])
  })
})
```

- [ ] **Step 2: Run tests to see them pass**

```bash
bun run test --reporter=verbose
```

Expected: all pass — Rule 3a/3b already handle these cases. If any fail, verify `prefixItems` key spelling and that `!Array.isArray(schema.items)` guard is in place.

- [ ] **Step 3: Commit**

```bash
git add tests/analyzeSchema.test.ts
git commit -m "test: add prefixItems, combined arrays, and nested array tests"
```

---

### Task 7: Context modes

**Files:**
- Modify: `tests/analyzeSchema.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/analyzeSchema.test.ts`:

```typescript
describe('analyzeSchema — context modes', () => {
  it('defaults to siblings when x-formula-context is absent', () => {
    const result = analyzeSchema(fixtures.flatWithOneFormula as any)
    expect(result[0].contextMode).toBe('siblings')
  })

  it('accepts explicit "siblings" context mode', () => {
    const schema = {
      type: 'object',
      properties: {
        a: { type: 'number' },
        b: { type: 'number', 'x-formula': 'a', 'x-formula-context': 'siblings' },
      },
    }
    expect(analyzeSchema(schema as any)[0].contextMode).toBe('siblings')
  })

  it('returns extended contextMode', () => {
    const result = analyzeSchema(fixtures.extendedContextSchema as any)
    expect(result[0].contextMode).toBe('extended')
  })

  it('treats unknown context as siblings and warns', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = analyzeSchema(fixtures.unknownContextSchema as any)
    expect(result[0].contextMode).toBe('siblings')
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('invalid-mode'))
    warnSpy.mockRestore()
  })
})
```

Add `vi` to the import at the top of the file:

```typescript
import { describe, it, expect, vi } from 'vitest'
```

- [ ] **Step 2: Run tests to see them pass**

```bash
bun run test --reporter=verbose
```

Expected: all pass — `resolveContextMode` already handles these cases.

- [ ] **Step 3: Commit**

```bash
git add tests/analyzeSchema.test.ts
git commit -m "test: add context mode tests"
```

---

### Task 8: Composition operator warnings and custom options

**Files:**
- Modify: `tests/analyzeSchema.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/analyzeSchema.test.ts`:

```typescript
describe('analyzeSchema — composition operators', () => {
  it('skips oneOf branches and emits a warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = analyzeSchema(fixtures.withOneOfSchema as any)
    expect(result).toEqual([])
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('oneOf'))
    warnSpy.mockRestore()
  })
})

describe('analyzeSchema — custom options', () => {
  it('uses a custom formulaKey', () => {
    const schema = {
      type: 'object',
      properties: {
        total: { type: 'number', 'x-calc': 'a + b' },
      },
    }
    const result = analyzeSchema(schema as any, { formulaKey: 'x-calc' })
    expect(result).toHaveLength(1)
    expect(result[0].formula).toBe('a + b')
  })

  it('uses a custom formulaContextKey', () => {
    const schema = {
      type: 'object',
      properties: {
        total: {
          type: 'number',
          'x-formula': 'a + b',
          'x-ctx': 'extended',
        },
      },
    }
    const result = analyzeSchema(schema as any, { formulaContextKey: 'x-ctx' })
    expect(result[0].contextMode).toBe('extended')
  })
})
```

- [ ] **Step 2: Run tests to see them pass**

```bash
bun run test --reporter=verbose
```

Expected: all pass. If the composition warning test fails, verify the `COMPOSITION_KEYS` loop runs before the formula check in `traverse`.

- [ ] **Step 3: Commit**

```bash
git add tests/analyzeSchema.test.ts
git commit -m "test: add composition operator warning and custom option tests"
```

---

### Task 9: Export public API from index.ts

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Update src/index.ts**

Replace the placeholder export in `src/index.ts` with the public API. `ARRAY_INDEX` is intentionally excluded — it is package-internal only.

```typescript
export { analyzeSchema } from './analyzeSchema'
export type { ContextMode, FormulaField, AnalyzeSchemaOptions } from './analyzeSchema'
```

- [ ] **Step 2: Build and verify**

```bash
bun run build && bunx publint
```

Expected: build succeeds, `bunx publint` reports no issues.

- [ ] **Step 3: Run full test suite**

```bash
bun run test
```

Expected: all tests pass in both `rjsf-v6` and `rjsf-v5` projects.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: export analyzeSchema public API from index.ts"
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
→ All tests pass in both `rjsf-v6` and `rjsf-v5`.

```bash
bunx publint
```
→ `✔ No issues found`
