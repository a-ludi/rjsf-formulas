# Issue 01 — Project Scaffolding Design

## Overview

Bootstrap the repository with a working build, test, and publish pipeline. All subsequent issues build on this foundation.

## Decisions

| Concern | Choice | Reason |
|---|---|---|
| Package manager | Bun | User preference |
| Test runner | Vitest | Required for multi-project (v5/v6) setup |
| Declarations | vite-plugin-dts | Generates `.d.mts` + `.d.cts` in a single build command |
| Pre-push hook | Build + publint only | Lightweight; no test run on push |
| Exports structure | Types inside each conditional export (Option B) | Required for publint to pass on dual ESM+CJS |
| Package name | `rjsf-formulas` | Follows community `rjsf-*` convention; `@rjsf/` scope is reserved for the official team |

## package.json

```json
{
  "name": "rjsf-formulas",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    "import": {
      "types": "./dist/index.d.mts",
      "default": "./dist/index.mjs"
    },
    "require": {
      "types": "./dist/index.d.cts",
      "default": "./dist/index.cjs"
    }
  },
  "scripts": {
    "build": "vite build",
    "test": "vitest run",
    "prepare": "husky",
    "prepublishOnly": "bun run build && bunx publint"
  },
  "peerDependencies": {
    "@rjsf/core": ">=5",
    "@rjsf/utils": ">=5",
    "react": ">=17"
  },
  "devDependencies": {
    "@rjsf/core": "^6",
    "@rjsf/utils": "^6",
    "rjsf-core-v5": "npm:@rjsf/core@^5",
    "rjsf-utils-v5": "npm:@rjsf/utils@^5",
    "vite": "^6",
    "vite-plugin-dts": "^4",
    "vitest": "^3",
    "typescript": "^5",
    "publint": "^0.3",
    "husky": "^9"
  }
}
```

## vite.config.ts

```typescript
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es', 'cjs'],
      fileName: (format) => format === 'es' ? 'index.mjs' : 'index.cjs',
    },
    rollupOptions: {
      external: ['react', '@rjsf/core', '@rjsf/utils'],
    },
  },
  plugins: [
    dts({
      rollupTypes: true,
      include: ['src'],
    }),
  ],
})
```

- Peer deps externalized — not bundled into the output
- `rollupTypes: true` collapses declarations into a single file; `vite-plugin-dts` emits both `.d.mts` and `.d.cts`

## vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'rjsf-v6',
          include: ['tests/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'rjsf-v5',
          include: ['tests/**/*.test.ts'],
          alias: {
            '@rjsf/core': 'rjsf-core-v5',
            '@rjsf/utils': 'rjsf-utils-v5',
          },
        },
      },
    ],
  },
})
```

Same test files run twice — once against RJSF v6, once against v5 via alias resolution.

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "skipLibCheck": true,
    "jsx": "react-jsx"
  },
  "include": ["src", "tests"]
}
```

`moduleResolution: "bundler"` is correct for Vite — allows extensionless imports and respects `package.json` `exports`.

## Husky pre-push hook

`.husky/pre-push`:
```sh
bun run build && bunx publint
```

Initialized via `bunx husky init`. The `prepare` script in `package.json` runs `husky` on `bun install` so collaborators get hooks automatically.

## src/index.ts (placeholder)

```typescript
export { Form as FormulaForm } from '@rjsf/core'
```

Temporary re-export so the build, declarations, and publint have something to validate. Replaced in issue 03.

## Acceptance verification

- `bun run build` → emits `dist/index.mjs`, `dist/index.cjs`, `dist/index.d.mts`, `dist/index.d.cts`
- `bun run test` → both `rjsf-v6` and `rjsf-v5` projects pass (empty suite)
- `bunx publint` → passes with no warnings
