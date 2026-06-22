import { describe, test, expect, beforeAll } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const distPath = fileURLToPath(new URL('../dist/index.mjs', import.meta.url))
const distExists = existsSync(distPath)

describe.skipIf(!distExists)('dist smoke test: React 18 compatibility', () => {
  let distContent: string

  beforeAll(() => {
    distContent = readFileSync(distPath, 'utf8')
  })

  test('react/jsx-runtime is not bundled into dist', () => {
    // Inlined jsx-runtime crashes React 18 consumers because React 19's jsx-runtime
    // reads React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE
    // which doesn't exist in React 18.
    // 'react-jsx-runtime' is the chunk name Rollup assigns when bundling this module.
    expect(distContent).not.toContain('react-jsx-runtime')
  })

  test('react/jsx-runtime is imported as an external dependency', () => {
    expect(distContent).toMatch(/from ['"]react\/jsx-runtime['"]/)
  })
})
