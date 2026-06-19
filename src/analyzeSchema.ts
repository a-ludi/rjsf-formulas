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
