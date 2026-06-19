import { describe, it, expect } from 'vitest'
import { mergeReadOnly } from '../src/mergeReadOnly'
import { ARRAY_INDEX } from '../src/analyzeSchema'
import type { FormulaField } from '../src/analyzeSchema'

describe('mergeReadOnly', () => {
  it('sets ui:readonly on a flat computed field', () => {
    const fields: FormulaField[] = [
      { path: ['total'], formula: 'a + b', contextMode: 'siblings' },
    ]
    const result = mergeReadOnly(undefined, fields)
    expect(result).toEqual({ total: { 'ui:readonly': true } })
  })

  it('sets ui:readonly on a nested computed field', () => {
    const fields: FormulaField[] = [
      { path: ['order', 'total'], formula: 'a + b', contextMode: 'siblings' },
    ]
    const result = mergeReadOnly(undefined, fields)
    expect(result).toEqual({ order: { total: { 'ui:readonly': true } } })
  })

  it('preserves existing uiSchema entries', () => {
    const fields: FormulaField[] = [
      { path: ['total'], formula: 'a + b', contextMode: 'siblings' },
    ]
    const existing = { price: { 'ui:widget': 'updown' } }
    const result = mergeReadOnly(existing, fields)
    expect(result).toEqual({
      price: { 'ui:widget': 'updown' },
      total: { 'ui:readonly': true },
    })
  })

  it('uses items object for ARRAY_INDEX (uniform array)', () => {
    const fields: FormulaField[] = [
      { path: ['rows', ARRAY_INDEX, 'total'], formula: 'a * b', contextMode: 'siblings' },
    ]
    const result = mergeReadOnly(undefined, fields)
    expect(result).toEqual({
      rows: { items: { total: { 'ui:readonly': true } } },
    })
  })

  it('uses items array for prefixItems (tuple slot)', () => {
    const fields: FormulaField[] = [
      { path: ['tuple', 2], formula: 'a + b', contextMode: 'siblings' },
    ]
    const result = mergeReadOnly(undefined, fields)
    expect(result).toEqual({
      tuple: { items: [undefined, undefined, { 'ui:readonly': true }] },
    })
  })

  it('uses items array + additionalItems when both integers and ARRAY_INDEX share an array', () => {
    const fields: FormulaField[] = [
      { path: ['mixed', 1], formula: 'a + b', contextMode: 'siblings' },
      { path: ['mixed', ARRAY_INDEX, 'total'], formula: 'x * y', contextMode: 'siblings' },
    ]
    const result = mergeReadOnly(undefined, fields)
    expect(result).toEqual({
      mixed: {
        items: [undefined, { 'ui:readonly': true }],
        additionalItems: { total: { 'ui:readonly': true } },
      },
    })
  })
})
