import { describe, it, expect } from 'vitest'
import { analyzeSchema, FormulaForm } from '../src/index'

describe('Public API', () => {
  it('exports analyzeSchema function', () => {
    expect(analyzeSchema).toBeDefined()
    expect(typeof analyzeSchema).toBe('function')
  })

  it('exports FormulaForm component', () => {
    expect(FormulaForm).toBeDefined()
    expect(typeof FormulaForm).toBe('function')
  })
})
