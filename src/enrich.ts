import equal from 'fast-deep-equal'
import type { RJSFSchema } from '@rjsf/utils'
import type { FormulaField, ArrayIndex } from './analyzeSchema'
import { ARRAY_INDEX } from './analyzeSchema'
import { buildContext } from './buildContext'
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

type EvalTask = { field: FormulaField; concretePath: (string | number)[]; context: object }

interface PassResult {
  data: unknown
  errors: Array<{ path: (string | number)[]; error: Error }>
}

async function applyAllFormulas(
  formData: unknown,
  formulaFields: FormulaField[],
  evaluator: (formula: string, context: object) => unknown | Promise<unknown>,
  contextOptions: BuildContextOptions
): Promise<PassResult> {
  const result = structuredClone(formData)

  // Collect all tasks from the snapshot before any evaluation
  const tasks: EvalTask[] = []
  for (const field of formulaFields) {
    for (const concretePath of expandPaths(field.path, result)) {
      const context = buildContext(field, concretePath, result, contextOptions)
      tasks.push({ field, concretePath, context })
    }
  }

  // Evaluate all formulas in parallel; new Promise() executor is try-catched, catching sync throws
  const settled = await Promise.allSettled(
    tasks.map(({ field, context }) => new Promise<unknown>(resolve => resolve(evaluator(field.formula, context))))
  )

  // Apply results
  const errors: Array<{ path: (string | number)[]; error: Error }> = []
  for (let i = 0; i < tasks.length; i++) {
    const { concretePath } = tasks[i]
    const outcome = settled[i]
    if (outcome.status === 'fulfilled') {
      setAt(result, concretePath, outcome.value)
    } else {
      const err = outcome.reason instanceof Error
        ? outcome.reason
        : new Error(String(outcome.reason))
      errors.push({ path: concretePath, error: err })
      setAt(result, concretePath, undefined)
    }
  }

  return { data: result, errors }
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

export async function enrich(
  formData: unknown,
  formulaFields: FormulaField[],
  evaluator: (formula: string, context: object) => unknown | Promise<unknown>,
  maxConvergencePasses: number,
  onFormulaError: ((path: (string | number)[], error: Error) => void) | undefined,
  formulaDataKey: string,
  formulaPathKey: string,
  checkCondition: (condition: RJSFSchema, formData: unknown) => boolean,
  formulaConflictBehavior: 'ignore' | 'warn' | 'error'
): Promise<unknown> {
  // Filter to only active fields based on condition
  const activeFields = formulaFields.filter(field =>
    field.condition === true || checkCondition(field.condition as RJSFSchema, formData)
  )

  if (activeFields.length === 0) return formData

  // Detect runtime conflicts among active fields with the same template path
  const pathSeen = new Map<string, FormulaField>()
  const deduped: FormulaField[] = []
  for (const field of activeFields) {
    const key = JSON.stringify(field.path)
    if (pathSeen.has(key)) {
      if (formulaConflictBehavior === 'error') {
        throw new TypeError(
          `[rjsf-formulas] Formula conflict: two active fields share path [${field.path.join(', ')}]`
        )
      } else if (formulaConflictBehavior === 'warn') {
        console.warn(
          `[rjsf-formulas] Formula conflict: two active fields share path [${field.path.join(', ')}]; taking last`
        )
      }
      // Replace the previous entry with the last one (take last)
      const idx = deduped.indexOf(pathSeen.get(key)!)
      deduped[idx] = field
      pathSeen.set(key, field)
    } else {
      pathSeen.set(key, field)
      deduped.push(field)
    }
  }

  const contextOptions: BuildContextOptions = { formulaDataKey, formulaPathKey }
  let current = formData

  for (let pass = 0; pass < maxConvergencePasses; pass++) {
    const { data: candidate, errors } = await applyAllFormulas(current, deduped, evaluator, contextOptions)
    if (allConverged(current, candidate, deduped)) {
      // Stable — emit error callbacks now that we know this is the final result
      for (const { path, error } of errors) {
        onFormulaError?.(path, error)
      }
      return candidate
    }
    current = candidate
  }

  // maxConvergencePasses exceeded — identify and report non-converging fields
  const { data: candidate } = await applyAllFormulas(current, deduped, evaluator, contextOptions)
  const result = structuredClone(candidate)

  for (const field of deduped) {
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
