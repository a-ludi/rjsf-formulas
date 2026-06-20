// Redirect CJS require('@rjsf/utils') → rjsf-utils-v5 so that rjsf-core-v5's
// pre-compiled CJS bundle gets the correct v5 utils (Vitest's ESM aliases don't
// intercept require() calls inside pre-compiled CJS bundles in node_modules).
// @ts-ignore -- Node.js built-in; @types/node not installed
import { createRequire } from 'module'

const req = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Module = req('module') as any
const originalResolveFilename = Module._resolveFilename.bind(Module)

Module._resolveFilename = (
  request: string,
  parent: unknown,
  isMain: boolean,
  options: unknown
): string => {
  if (request === '@rjsf/utils') return originalResolveFilename('rjsf-utils-v5', parent, isMain, options)
  if (request === '@rjsf/validator-ajv8') return originalResolveFilename('rjsf-validator-v5', parent, isMain, options)
  return originalResolveFilename(request, parent, isMain, options)
}
