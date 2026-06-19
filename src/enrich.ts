import equal from 'fast-deep-equal'
import type { FormulaField, ArrayIndex } from './analyzeSchema'
import { ARRAY_INDEX } from './analyzeSchema'
import { buildContext as buildContextFn } from './buildContext'
import type { BuildContextOptions } from './buildContext'

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

export function deepEqual(a: unknown, b: unknown): boolean {
  return equal(a, b)
}

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
  onFormulaError: ((path: (string | number)[], error: Error) => void) | undefined,
  formulaDataKey = '__formData__',
  formulaPathKey = '__path__'
): unknown {
  if (formulaFields.length === 0) return formData

  const contextOptions: BuildContextOptions = { formulaDataKey, formulaPathKey }
  let current = formData

  for (let pass = 0; pass < maxConvergencePasses; pass++) {
    // Suppress error callbacks during intermediate passes; errors are reported only on the
    // final stable pass so each formula error fires at most once.
    const candidate = applyAllFormulas(current, formulaFields, evaluator, undefined, contextOptions)
    if (allConverged(current, candidate, formulaFields)) {
      // Stable — run one final pass with error reporting to emit callbacks
      return applyAllFormulas(current, formulaFields, evaluator, onFormulaError, contextOptions)
    }
    current = candidate
  }

  // maxConvergencePasses exceeded — identify and report non-converging fields
  const candidate = applyAllFormulas(current, formulaFields, evaluator, undefined, contextOptions)
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
