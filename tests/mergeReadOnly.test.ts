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

  it('does not mutate the original uiSchema', () => {
    const fields: FormulaField[] = [
      { path: ['total'], formula: 'a + b', contextMode: 'siblings' },
    ]
    const original = { total: { 'ui:widget': 'updown' } }
    const originalRef = original.total  // hold reference to nested object
    mergeReadOnly(original, fields)
    expect(original.total['ui:widget']).toBe('updown')
    expect(original.total['ui:readonly']).toBeUndefined()  // must not be mutated
    expect(original.total).toBe(originalRef)  // same object reference, not mutated
  })

  it('preserves existing items object when writing a tuple slot would conflict', () => {
    const fields: FormulaField[] = [
      { path: ['rows', 0], formula: 'a + b', contextMode: 'siblings' },
    ]
    const existing = { rows: { items: { 'ui:widget': 'updown' } } }
    // structuredClone the input so we can check the return value independently
    const result = mergeReadOnly(structuredClone(existing), fields)
    // The existing items object must not be destroyed; injection is skipped with a warning
    expect(result.rows?.['items']).toEqual({ 'ui:widget': 'updown' })
  })

  it('preserves existing items array when writing a uniform slot would conflict', () => {
    const fields: FormulaField[] = [
      { path: ['rows', ARRAY_INDEX, 'total'], formula: 'a * b', contextMode: 'siblings' },
    ]
    const existing = { rows: { items: [{ 'ui:widget': 'foo' }] } }
    const result = mergeReadOnly(structuredClone(existing), fields)
    // The existing items array must not be destroyed; injection is skipped with a warning
    expect(Array.isArray(result.rows?.['items'])).toBe(true)
    expect((result.rows?.['items'] as any[])[0]?.['ui:widget']).toBe('foo')
  })
})
