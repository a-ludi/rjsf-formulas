# Issue 02 — Schema Analysis Design

## Overview

Implement `analyzeSchema`, a pure function that traverses a JSON schema and returns descriptors for all computed fields. This is the foundation that all evaluation code builds on.

---

## Public Interface

**File:** `src/analyzeSchema.ts`

```typescript
export const ARRAY_INDEX: unique symbol = Symbol('arrayIndex')
export type ArrayIndex = typeof ARRAY_INDEX

export type ContextMode = 'siblings' | 'extended'

export type FormulaField = {
  path: (string | number | ArrayIndex)[]
  formula: string
  contextMode: ContextMode
}

export type AnalyzeSchemaOptions = {
  formulaKey?: string         // default: 'x-formula'
  formulaContextKey?: string  // default: 'x-formula-context'
}

export function analyzeSchema(
  schema: RJSFSchema,
  options?: AnalyzeSchemaOptions
): FormulaField[]
```

`ARRAY_INDEX` is exported from `analyzeSchema.ts` for use by other source files within the package (evaluation code imports it to detect array slots in paths), but it is **not** re-exported from `src/index.ts` — it is not part of the public API. It appears in paths to represent variable-length array slots.

Path segment types:
- `string` — object property key
- `number` — static `prefixItems` position
- `ArrayIndex` — variable-length `items` slot (the private symbol)

---

## Traversal Algorithm

A private recursive helper walks the schema tree, accumulating the current path:

```
traverse(schema, path):
  1. If schema has formulaKey
       → record FormulaField; stop (computed fields are leaves, never recursed into)

  2. If schema.type === 'object' and schema.properties exist
       → for each [key, propSchema] in properties:
            traverse(propSchema, [...path, key])

  3. If schema.type === 'array':
       a. If schema.prefixItems exists
            → for each [index, itemSchema] in prefixItems:
                 traverse(itemSchema, [...path, index])   // literal integer
       b. If schema.items is a schema object
            → traverse(schema.items, [...path, ARRAY_INDEX])
       c. Both a and b can coexist in the same schema — traverse both

  4. Otherwise → stop (primitive type, or schema composition operator — see Edge Cases)
```

Rule 1 takes priority over all others: a field with a formula is always a leaf. Rules 2 and 3 are mutually exclusive by schema type. Rule 4 is the fallthrough.

---

## Edge Cases

### Unknown `formulaContextKey` value

Treated as `'siblings'`. Emits `console.warn` with the unrecognized value and the field path.

### Schema composition operators (`$ref`, `oneOf`, `anyOf`, `allOf`)

Recursion stops at these nodes. Emits `console.warn` with the operator name and the current path. Support for schema composition is deferred to issue 06.

---

## Out of Scope (v1)

Schema composition operators (`$ref`, `oneOf`, `anyOf`, `allOf`) are not traversed. See issue 06.

---

## Testing

**File:** `tests/analyzeSchema.test.ts`

Shared schema fixtures live in `tests/fixtures/schemas.ts` — plain exported objects, no test framework imports, reusable across issue 02–05 tests.

Test cases:
- Flat object with one computed field
- Flat object with multiple computed fields
- No computed fields → returns `[]`
- Nested object (computed field at depth > 1)
- Array with `items` → path contains `ARRAY_INDEX`
- Array with `prefixItems` → path contains integer indices
- Array with both `prefixItems` and `items`
- Nested arrays (array of array of object)
- `contextMode: 'siblings'` — key absent
- `contextMode: 'siblings'` — explicit `"siblings"`
- `contextMode: 'extended'`
- Unknown context value → `'siblings'` + `console.warn` called
- Schema composition operator present → skipped + `console.warn` called
- Custom `formulaKey` and `formulaContextKey` options

Tests run against both RJSF v5 and v6 via the Vitest multi-project config.
