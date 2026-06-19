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
