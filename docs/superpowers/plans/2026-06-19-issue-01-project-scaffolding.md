# Issue 01 — Project Scaffolding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap the repository with a working build, test, and publish pipeline so subsequent issues have a solid foundation to build on.

**Architecture:** `src/index.ts` is the library entry point, compiled by Vite in library mode to dual ESM+CJS output. `vite-plugin-dts` generates paired `.d.mts`/`.d.cts` declaration files. Vitest runs the same test suite twice (once per RJSF version) via inline workspace project config.

**Tech Stack:** Bun (package manager), Vite 6 + vite-plugin-dts 4 (build), TypeScript 5 (types), Vitest 3 (tests), publint (distribution validation), Husky 9 (git hooks)

**Spec:** `docs/superpowers/specs/2026-06-19-issue-01-project-scaffolding-design.md`

---

### Task 1: package.json and dependencies

**Files:**
- Create: `package.json`

- [ ] **Step 1: Write package.json**

Create `package.json` at the repo root:

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
    "husky": "^9",
    "react": "^18",
    "@types/react": "^18"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
bun install
```

Expected: `bun.lockb` created, `node_modules/` populated. Verify `@rjsf/core`, `rjsf-core-v5`, `vite`, `vitest`, and `husky` all appear under `node_modules/`.

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lockb
git commit -m "chore: add package.json and install dependencies"
```

---

### Task 2: TypeScript configuration

**Files:**
- Create: `tsconfig.json`

- [ ] **Step 1: Write tsconfig.json**

Create `tsconfig.json` at the repo root:

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

- [ ] **Step 2: Verify TypeScript is available**

```bash
bunx tsc --version
```

Expected: `Version 5.x.x`

- [ ] **Step 3: Commit**

```bash
git add tsconfig.json
git commit -m "chore: add TypeScript configuration"
```

---

### Task 3: Placeholder entry point

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Create src directory and entry point**

Create `src/index.ts`:

```typescript
export { Form as FormulaForm } from '@rjsf/core'
```

- [ ] **Step 2: Type-check the entry point**

```bash
bunx tsc --noEmit
```

Expected: no output, exit code 0. If you see errors about missing types, verify `@types/react` is installed under `node_modules/`.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "chore: add placeholder FormulaForm entry point"
```

---

### Task 4: Vite build configuration

**Files:**
- Create: `vite.config.ts`

- [ ] **Step 1: Write vite.config.ts**

Create `vite.config.ts` at the repo root:

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

- [ ] **Step 2: Run the build**

```bash
bun run build
```

Expected output (approximate):

```
vite v6.x.x building for production...
✓ N modules transformed.
dist/index.cjs    XX kB
dist/index.mjs    XX kB
✓ built in Xms
```

After the build, `vite-plugin-dts` runs separately and should emit declaration files.

- [ ] **Step 3: Verify dist contents**

```bash
ls dist/
```

Expected files: `index.mjs`, `index.cjs`, `index.d.mts`, `index.d.cts` (and optionally `index.d.ts`, `index.d.mts.map`, `index.d.cts.map`).

If `index.d.mts` and `index.d.cts` are missing but `index.d.ts` is present, `vite-plugin-dts` did not emit the paired declaration variants. In that case, add a post-build copy step to the `build` script in `package.json`:

```json
"build": "vite build && cp dist/index.d.ts dist/index.d.mts && cp dist/index.d.ts dist/index.d.cts"
```

Re-run `bun run build` and verify all four files appear.

- [ ] **Step 4: Commit**

```bash
git add vite.config.ts
git commit -m "chore: add Vite library build configuration"
```

---

### Task 5: Vitest configuration and smoke test

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/index.test.ts`

- [ ] **Step 1: Write vitest.config.ts**

Create `vitest.config.ts` at the repo root:

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
        },
        resolve: {
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

- [ ] **Step 2: Write a smoke test**

Create `tests/index.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { FormulaForm } from '../src/index'

describe('FormulaForm', () => {
  it('is exported', () => {
    expect(FormulaForm).toBeDefined()
  })
})
```

- [ ] **Step 3: Run the test suite**

```bash
bun run test
```

Expected output (approximate):

```
 ✓ rjsf-v6 > tests/index.test.ts > FormulaForm > is exported
 ✓ rjsf-v5 > tests/index.test.ts > FormulaForm > is exported

 Test Files  1 passed (2)
      Tests  2 passed (2)
```

Both projects (`rjsf-v6` and `rjsf-v5`) must appear and pass. If only one project appears, the `projects` config wasn't picked up — double-check the key name (`projects` vs `workspace`) against the installed Vitest version's docs (`bunx vitest --version`).

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts tests/index.test.ts
git commit -m "chore: add Vitest configuration and smoke test"
```

---

### Task 6: publint validation

**Files:** none (validates existing dist output)

- [ ] **Step 1: Build (if dist is stale)**

```bash
bun run build
```

- [ ] **Step 2: Run publint**

```bash
bunx publint
```

Expected:

```
✔ No issues found
```

If publint reports issues:

- **"Missing `types` condition"** — verify `exports` in `package.json` has `"types"` inside both `"import"` and `"require"` conditions.
- **"Declaration file not found"** — verify `dist/index.d.mts` and `dist/index.d.cts` both exist. If missing, see Task 4 Step 3 for the fallback copy step.
- **"Dual package hazard"** — should not occur with this setup; if it does, ensure `"type": "module"` is set in `package.json`.

Fix any issues, re-run `bun run build`, re-run `bunx publint`, and verify clean output before continuing.

- [ ] **Step 3: Add dist to .gitignore**

Verify `dist/` is in `.gitignore` (it should already be there from the initial commit). If not:

```bash
echo "dist/" >> .gitignore
git add .gitignore
git commit -m "chore: ignore dist output"
```

No commit needed if `.gitignore` already covers `dist/`.

---

### Task 7: Husky git hook

**Files:**
- Create: `.husky/pre-push`

- [ ] **Step 1: Initialize Husky**

```bash
bunx husky init
```

Expected: `.husky/` directory created with a sample `pre-commit` file, and `"prepare": "husky"` added to `package.json` scripts. (The `prepare` script is already in our `package.json` — Husky may skip adding it again or overwrite it identically.)

- [ ] **Step 2: Write the pre-push hook**

Overwrite `.husky/pre-push` (Husky init may create a `pre-commit` instead — create `pre-push` regardless):

```sh
bun run build && bunx publint
```

Make it executable:

```bash
chmod +x .husky/pre-push
```

- [ ] **Step 3: Remove the sample pre-commit hook if present**

```bash
rm -f .husky/pre-commit
```

Only run this if `bunx husky init` created a `pre-commit` file you don't want.

- [ ] **Step 4: Verify the hook runs**

Trigger it manually:

```bash
bash .husky/pre-push
```

Expected: build succeeds, `bunx publint` exits with `✔ No issues found` and code 0.

- [ ] **Step 5: Commit**

```bash
git add .husky/
git commit -m "chore: add Husky pre-push hook (build + publint)"
```

---

## Final verification

Run the full acceptance checklist in order:

```bash
bun run build
```
→ `dist/index.mjs`, `dist/index.cjs`, `dist/index.d.mts`, `dist/index.d.cts` all present.

```bash
bun run test
```
→ both `rjsf-v6` and `rjsf-v5` pass.

```bash
bunx publint
```
→ `✔ No issues found`
