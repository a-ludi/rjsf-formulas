import { describe, it, expect } from 'vitest'
import { analyzeSchema } from '../src/index'

describe('Public API', () => {
  it('exports analyzeSchema function', () => {
    expect(analyzeSchema).toBeDefined()
    expect(typeof analyzeSchema).toBe('function')
  })
})
