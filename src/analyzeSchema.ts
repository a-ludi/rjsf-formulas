import type { RJSFSchema } from '@rjsf/utils'

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
}

/**
 * Options for {@link analyzeSchema}.
 */
export type AnalyzeSchemaOptions = {
  /** Schema key that marks a field as computed. Defaults to `'x-formula'`. */
  formulaKey?: string
  /** Schema key that selects the context mode for a computed field. Defaults to `'x-formula-context'`. */
  formulaContextKey?: string
}

/**
 * Scans a JSON Schema and returns descriptors for every field that carries a formula key.
 *
 * @remarks
 * Traversal is depth-first. Schema composition operators (`$ref`, `oneOf`, `anyOf`, `allOf`)
 * are not supported and emit a `console.warn` when encountered.
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
  const fields: FormulaField[] = []
  traverse(schema, [], fields, formulaKey, formulaContextKey)
  return fields
}

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
    const formula = (schema as Record<string, unknown>)[formulaKey]
    if (typeof formula !== 'string') {
      console.warn(
        `[rjsf-formulas] Formula at path [${formatPath(path)}] is not a string (got ${typeof formula}), skipping.`
      )
      return
    }
    fields.push({
      path,
      formula,
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
}
