import type { RJSFSchema } from '@rjsf/utils'
import { findSchemaDefinition } from '@rjsf/utils'

/**
 * Sentinel used in formula field paths to represent a uniform array item position.
 * @internal
 */
export const ARRAY_INDEX: unique symbol = Symbol('arrayIndex')

/** @internal */
export type ArrayIndex = typeof ARRAY_INDEX

/**
 * Controls which values are injected into the formula evaluation context.
 *
 * - `'siblings'` (default): only the sibling fields of the computed field are available by name.
 * - `'extended'`: full form data and the field's resolved path are injected alongside sibling
 *   values, under the keys configured by `formulaDataKey` and `formulaPathKey`.
 *
 * Set via the `x-formula-context` schema key (or the `formulaContextKey` prop).
 */
export type ContextMode = 'siblings' | 'extended'

/**
 * Describes a single computed field discovered by {@link analyzeSchema}.
 */
export type FormulaField = {
  /** JSON path to the field within the form data. Uniform array item positions are represented by {@link ARRAY_INDEX}. */
  path: (string | number | ArrayIndex)[]
  /** The raw formula string from the schema. */
  formula: string
  /** Which values are available when evaluating this field's formula. */
  contextMode: ContextMode
  /**
   * The schema condition under which this formula is active.
   *
   * - `true` — always active (fields from `properties`, `items`, `prefixItems`, or `allOf` branches).
   * - `RJSFSchema` — a conditional schema (a `oneOf`/`anyOf` branch condition, possibly composed
   *   via `{ allOf: [...] }` for nested branches).
   */
  condition: RJSFSchema | true
}

/**
 * Options for {@link analyzeSchema}.
 */
export type AnalyzeSchemaOptions = {
  /** Schema key that marks a field as computed. Defaults to `'x-formula'`. */
  formulaKey?: string
  /** Schema key that selects the context mode for a computed field. Defaults to `'x-formula-context'`. */
  formulaContextKey?: string
  /**
   * What to do when multiple `allOf` branches define a formula for the same path.
   *
   * - `'ignore'`: silently take the last definition.
   * - `'warn'` (default): emit `console.warn` and take the last definition.
   * - `'error'`: throw a `TypeError` synchronously.
   */
  formulaConflictBehavior?: 'ignore' | 'warn' | 'error'
}

/**
 * Scans a JSON Schema and returns descriptors for every field that carries a formula key.
 *
 * @remarks
 * Traversal is depth-first. `allOf`, `$ref`, `oneOf`, and `anyOf` are all supported.
 * `allOf` branches are merged with conflict detection. `oneOf`/`anyOf` branches are each
 * recursed and fields are collected with the branch schema as the `condition`. Nested
 * `oneOf`/`anyOf` conditions are composed via `{ allOf: [...] }`. `$ref` is resolved
 * synchronously using `findSchemaDefinition` (external refs will throw).
 *
 * @param schema - The root RJSF schema to scan.
 * @param options - Optional key overrides for locating formulas in the schema.
 * @returns An array of {@link FormulaField} descriptors, one per computed field found.
 *
 * @example
 * ```ts
 * import { analyzeSchema } from '@a-ludi/rjsf-formulas'
 *
 * const fields = analyzeSchema({
 *   type: 'object',
 *   properties: {
 *     price: { type: 'number' },
 *     total: { type: 'number', 'x-formula': 'price * 2' },
 *   },
 * })
 * // fields[0].path    => ['total']
 * // fields[0].formula => 'price * 2'
 * ```
 */
export function analyzeSchema(
  schema: RJSFSchema,
  options?: AnalyzeSchemaOptions
): FormulaField[] {
  const formulaKey = options?.formulaKey ?? 'x-formula'
  const formulaContextKey = options?.formulaContextKey ?? 'x-formula-context'
  const formulaConflictBehavior = options?.formulaConflictBehavior ?? 'warn'
  const fields: FormulaField[] = []
  traverse(schema, [], fields, formulaKey, formulaContextKey, formulaConflictBehavior, true, schema)
  return fields
}

/**
 * Compose an ambient condition with a new branch schema.
 *
 * - If `ambient === true`: returns `branch` directly (no wrapping needed).
 * - If `ambient` already has an `allOf`: appends `branch` to that array.
 * - Otherwise: wraps both in `{ allOf: [ambient, branch] }`.
 */
function composeCondition(ambient: RJSFSchema | true, branch: RJSFSchema): RJSFSchema {
  if (ambient === true) return branch
  const ambientAny = ambient as Record<string, unknown>
  if (Array.isArray(ambientAny['allOf'])) {
    return { allOf: [...(ambientAny['allOf'] as RJSFSchema[]), branch] }
  }
  return { allOf: [ambient, branch] }
}

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

function pathKey(path: (string | number | ArrayIndex)[]): string {
  return path.map(s => (typeof s === 'symbol' ? '[*]' : String(s))).join('.')
}

function applyConflictBehavior(
  existing: FormulaField,
  incoming: FormulaField,
  behavior: 'ignore' | 'warn' | 'error'
): void {
  const key = pathKey(existing.path)
  if (behavior === 'error') {
    throw new TypeError(
      `[rjsf-formulas] Formula conflict at path [${formatPath(existing.path)}]: "${existing.formula}" vs "${incoming.formula}". Resolve the conflict or set formulaConflictBehavior to 'ignore' or 'warn'.`
    )
  }
  if (behavior === 'warn') {
    console.warn(
      `[rjsf-formulas] Formula conflict at path [${key}]: "${existing.formula}" (earlier allOf branch) is overridden by "${incoming.formula}" (later allOf branch).`
    )
  }
}

function mergeFields(
  base: FormulaField[],
  incoming: FormulaField[],
  behavior: 'ignore' | 'warn' | 'error'
): void {
  for (const field of incoming) {
    const key = pathKey(field.path)
    const existingIndex = base.findIndex(f => pathKey(f.path) === key)
    if (existingIndex !== -1) {
      applyConflictBehavior(base[existingIndex], field, behavior)
      base[existingIndex] = field
    } else {
      base.push(field)
    }
  }
}

function traverse(
  schema: RJSFSchema,
  path: (string | number | ArrayIndex)[],
  fields: FormulaField[],
  formulaKey: string,
  formulaContextKey: string,
  formulaConflictBehavior: 'ignore' | 'warn' | 'error',
  ambientCondition: RJSFSchema | true,
  rootSchema: RJSFSchema
): void {
  const schemaAny = schema as Record<string, unknown>

  // $ref — resolve and continue traversal with the same ambientCondition
  if (typeof schemaAny['$ref'] === 'string') {
    const resolved = findSchemaDefinition(schemaAny['$ref'] as string, rootSchema)
    traverse(resolved, path, fields, formulaKey, formulaContextKey, formulaConflictBehavior, ambientCondition, rootSchema)
    return
  }

  // Rule 1: computed field — record and stop
  if (formulaKey in schema) {
    const formula = schemaAny[formulaKey]
    if (typeof formula !== 'string') {
      console.warn(
        `[rjsf-formulas] Formula at path [${formatPath(path)}] is not a string (got ${typeof formula}), skipping.`
      )
      return
    }
    fields.push({
      path,
      formula,
      contextMode: resolveContextMode(schemaAny[formulaContextKey], path),
      condition: ambientCondition,
    })
    return
  }

  // Rule 2: object — recurse into properties (type: 'object' is implicit when properties are present)
  if (schema.properties && schema.type !== 'array') {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      traverse(
        propSchema as RJSFSchema,
        [...path, key],
        fields,
        formulaKey,
        formulaContextKey,
        formulaConflictBehavior,
        ambientCondition,
        rootSchema
      )
    }
  }

  // Rule 3: array — recurse into prefixItems and/or items
  if (schema.type === 'array') {
    // Rule 3a: prefixItems (tuple positions with static indices)
    if (Array.isArray(schemaAny['prefixItems'])) {
      const prefixItems = schemaAny['prefixItems'] as RJSFSchema[]
      prefixItems.forEach((itemSchema, index) => {
        traverse(itemSchema, [...path, index], fields, formulaKey, formulaContextKey, formulaConflictBehavior, ambientCondition, rootSchema)
      })
    }

    // Rule 3b: items (uniform array — all elements share one schema)
    if (schema.items && !Array.isArray(schema.items)) {
      traverse(
        schema.items as RJSFSchema,
        [...path, ARRAY_INDEX],
        fields,
        formulaKey,
        formulaContextKey,
        formulaConflictBehavior,
        ambientCondition,
        rootSchema
      )
    }
  }

  // Rule 4: allOf — recurse into each branch, then merge with conflict detection
  // allOf does not add to the condition — branches are always active within their parent's condition
  if (Array.isArray(schemaAny['allOf'])) {
    const allOfBranches = schemaAny['allOf'] as RJSFSchema[]
    for (const branch of allOfBranches) {
      const branchFields: FormulaField[] = []
      traverse(branch, path, branchFields, formulaKey, formulaContextKey, formulaConflictBehavior, ambientCondition, rootSchema)
      mergeFields(fields, branchFields, formulaConflictBehavior)
    }
  }

  // Rule 5: oneOf / anyOf — recurse each branch with a composed condition
  for (const compositionKey of ['oneOf', 'anyOf'] as const) {
    if (Array.isArray(schemaAny[compositionKey])) {
      const branches = schemaAny[compositionKey] as RJSFSchema[]
      for (const branch of branches) {
        const branchCondition = composeCondition(ambientCondition, branch)
        traverse(branch, path, fields, formulaKey, formulaContextKey, formulaConflictBehavior, branchCondition, rootSchema)
      }
    }
  }
}
