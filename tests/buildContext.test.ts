import { describe, it, expect } from 'vitest'
import { buildContext } from '../src/buildContext'
import type { FormulaField } from '../src/analyzeSchema'

const defaultOpts = { formulaDataKey: '__formData__', formulaPathKey: '__path__' }

const siblingsField: FormulaField = {
  path: ['total'],
  formula: 'price * quantity',
  contextMode: 'siblings',
  condition: true,
}

const extendedField: FormulaField = {
  path: ['total'],
  formula: '__formData__.price * quantity',
  contextMode: 'extended',
  condition: true,
}

describe('buildContext — siblings mode', () => {
  it('returns sibling fields of the target', () => {
    const data = { price: 10, quantity: 3, total: 0 }
    const result = buildContext(siblingsField, ['total'], data, defaultOpts)
    expect(result).toEqual({ price: 10, quantity: 3, total: 0 })
  })

  it('does not inject __formData__ or __path__', () => {
    const data = { price: 10, quantity: 3, total: 0 }
    const result = buildContext(siblingsField, ['total'], data, defaultOpts) as any
    expect(result.__formData__).toBeUndefined()
    expect(result.__path__).toBeUndefined()
  })

  it('returns siblings for a nested field', () => {
    const data = { order: { price: 5, quantity: 2, total: 0 } }
    const field: FormulaField = { ...siblingsField, path: ['order', 'total'] }
    const result = buildContext(field, ['order', 'total'], data, defaultOpts)
    expect(result).toEqual({ price: 5, quantity: 2, total: 0 })
  })
})

describe('buildContext — extended mode', () => {
  it('includes sibling fields', () => {
    const data = { price: 10, quantity: 3, total: 0 }
    const result = buildContext(extendedField, ['total'], data, defaultOpts) as any
    expect(result.price).toBe(10)
    expect(result.quantity).toBe(3)
    expect(result.total).toBe(0)
  })

  it('injects __formData__ as the full candidateFormData', () => {
    const data = { price: 10, quantity: 3, total: 0 }
    const result = buildContext(extendedField, ['total'], data, defaultOpts) as any
    expect(result.__formData__).toBe(data)
  })

  it('injects __path__ as the resolved path', () => {
    const data = { price: 10, quantity: 3, total: 0 }
    const result = buildContext(extendedField, ['total'], data, defaultOpts) as any
    expect(result.__path__).toEqual(['total'])
  })

  it('injects the concrete array index in __path__, not a sentinel', () => {
    const data = { items: [{ price: 5, quantity: 2, total: 0 }] }
    const field: FormulaField = { ...extendedField, path: ['items', 0, 'total'] }
    const result = buildContext(field, ['items', 1, 'total'], data, defaultOpts) as any
    expect(result.__path__).toEqual(['items', 1, 'total'])
  })

  it('uses custom formulaDataKey', () => {
    const data = { a: 1, b: 0 }
    const field: FormulaField = { ...extendedField, path: ['b'] }
    const result = buildContext(field, ['b'], data, {
      formulaDataKey: 'formData',
      formulaPathKey: '__path__',
    }) as any
    expect(result.formData).toBe(data)
    expect(result.__formData__).toBeUndefined()
  })

  it('uses custom formulaPathKey', () => {
    const data = { a: 1, b: 0 }
    const field: FormulaField = { ...extendedField, path: ['b'] }
    const result = buildContext(field, ['b'], data, {
      formulaDataKey: '__formData__',
      formulaPathKey: 'fieldPath',
    }) as any
    expect(result.fieldPath).toEqual(['b'])
    expect(result.__path__).toBeUndefined()
  })
})
