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
    if (options.formulaDataKey in siblings || options.formulaPathKey in siblings) {
      console.warn(
        `[rjsf-formulas] Extended context key collision: sibling field named "${
          options.formulaDataKey in siblings ? options.formulaDataKey : options.formulaPathKey
        }" will be overwritten by the injected context. Use formulaDataKey/formulaPathKey props to choose a different key.`
      )
    }
    return {
      ...siblings,
      [options.formulaDataKey]: candidateFormData,
      [options.formulaPathKey]: [...resolvedPath],
    }
  }

  return siblings
}
