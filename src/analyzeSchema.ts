import type { RJSFSchema } from '@rjsf/utils'

/** Package-internal — not re-exported from the public entry point. Used by enrich.ts and mergeReadOnly.ts. */
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
