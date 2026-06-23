# Fix: Bundled react/jsx-runtime + React 18 Smoke Test

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two build bugs that crash consumers on React 18, and add a smoke test that imports the built artifact under React 18 so this class of regression is caught automatically.

**Architecture:** The Vite library config externalizes `react` but not `react/jsx-runtime`, so the React 19 JSX runtime gets bundled. That bundled runtime reads `React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE`, which is undefined in React 18. Fix: add the missing entries to `rollupOptions.external`. Separately, `react-dom` sits in `dependencies` instead of `peerDependencies` — move it. The smoke test follows the existing rjsf-v5 alias pattern: a vitest project that points `react` → `react18` (npm alias) and imports from `../dist/index.mjs`. The test skips gracefully when the dist hasn't been built locally; CI is updated to build before testing.

**Tech Stack:** Vite 6, Vitest 3, React 18 (npm alias), react-dom 18 (npm alias), RJSF v6, jsdom

---

## File Map

| Action | Path |
|--------|------|
| Modify | `package.json` |
| Modify | `vite.config.ts` |
| Modify | `vitest.config.ts` |
| Create | `tests/dist.smoke.react18.test.tsx` |
| Modify | `.github/workflows/ci.yml` |

---

### Task 1: Add React 18 npm aliases to devDependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add aliases to devDependencies**

In `package.json`, add two entries to `devDependencies` (keep alphabetical order with the existing entries):

```json
"react18": "npm:react@^18",
"react-dom18": "npm:react-dom@^18",
```

- [ ] **Step 2: Install**

```bash
bun install
```

Expected: lock file updated, `node_modules/react18` and `node_modules/react-dom18` directories created.

- [ ] **Step 3: Verify aliases resolved**

```bash
node -e "console.log(require('./node_modules/react18/package.json').version)"
node -e "console.log(require('./node_modules/react-dom18/package.json').version)"
```

Expected: both print a `18.x.x` version string.

---

### Task 2: Write the failing smoke test

**Files:**
- Modify: `vitest.config.ts`
- Create: `tests/dist.smoke.react18.test.tsx`

- [ ] **Step 1: Add the dist-react18 vitest project**

In `vitest.config.ts`, add the following project to the `projects` array (after the existing four projects):

```ts
{
  test: {
    name: 'dist-react18',
    include: ['tests/*.smoke.test.tsx'],
    environment: 'jsdom',
  },
  resolve: {
    alias: {
      'react': 'react18',
      'react/jsx-runtime': 'react18/jsx-runtime',
      'react/jsx-dev-runtime': 'react18/jsx-dev-runtime',
      'react-dom': 'react-dom18',
      'react-dom/client': 'react-dom18/client',
    },
  },
},
```

- [ ] **Step 2: Create the smoke test file**

Create `tests/dist.smoke.react18.test.tsx` with this content:

```tsx
import { describe, test, beforeAll, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import validator from '@rjsf/validator-ajv8'

const distPath = fileURLToPath(new URL('../dist/index.mjs', import.meta.url))
const distExists = existsSync(distPath)

describe.skipIf(!distExists)('dist smoke test: React 18 compatibility', () => {
  let FormulaForm: React.ComponentType<any>

  beforeAll(async () => {
    const mod = await import('../dist/index.mjs')
    FormulaForm = mod.FormulaForm
  })

  test('FormulaForm renders without crashing with React 18', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        React.createElement(FormulaForm, {
          schema: { type: 'object', properties: {} },
          validator,
          evaluator: (_formula: string, _context: object) => null,
        })
      )
    })

    await act(async () => { root.unmount() })
    document.body.removeChild(container)
  })
})
```

---

### Task 3: Build the pre-fix dist and confirm the test fails (red)

**Files:** (no changes)

- [ ] **Step 1: Build the current (broken) dist**

```bash
bun run build
```

- [ ] **Step 2: Run only the smoke test project**

```bash
bunx vitest run --project dist-react18
```

Expected output: the test **fails** with:

```
TypeError: Cannot read properties of undefined (reading 'recentlyCreatedOwnerStacks')
```

If it passes instead, the root cause analysis was wrong — stop and re-investigate before continuing.

---

### Task 4: Fix vite.config.ts — externalize the missing React entries

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: Extend the external list**

In `vite.config.ts`, change the `rollupOptions.external` array from:

```ts
external: ['react', '@rjsf/core', '@rjsf/utils'],
```

to:

```ts
external: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom', '@rjsf/core', '@rjsf/utils'],
```

---

### Task 5: Fix package.json — move react-dom to peerDependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Move react-dom**

In `package.json`:

1. Remove the entire `"dependencies"` block (it only contains `react-dom`):
   ```json
   "dependencies": {
     "react-dom": "^19"
   },
   ```

2. Add `react-dom` to `peerDependencies`:
   ```json
   "peerDependencies": {
     "@rjsf/core": ">=5",
     "@rjsf/utils": ">=5",
     "react": ">=17",
     "react-dom": ">=17"
   },
   ```

3. Add `react-dom` to `devDependencies` so local development still works (it's likely already covered by `react-dom18`, but the `^19` version is needed for the demo):
   ```json
   "react-dom": "^19",
   ```

---

### Task 6: Rebuild and verify the smoke test passes (green)

**Files:** (no changes)

- [ ] **Step 1: Rebuild with the fixed config**

```bash
bun run build
```

- [ ] **Step 2: Confirm react/jsx-runtime is no longer inlined**

```bash
grep -c "react-jsx-runtime" dist/index.mjs
```

Expected: `0`

- [ ] **Step 3: Confirm react/jsx-runtime is now imported externally**

```bash
grep "jsx-runtime" dist/index.mjs
```

Expected: a line like `import { jsx as _jsx, ... } from "react/jsx-runtime";`

- [ ] **Step 4: Run the smoke test — it must pass**

```bash
bunx vitest run --project dist-react18
```

Expected: `1 passed`

- [ ] **Step 5: Run the full test suite — no regressions**

```bash
bun run test
```

Expected: all existing tests pass; the smoke test also passes (dist was just built).

---

### Task 7: Update CI to build before testing

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add a build step to the test job**

In `.github/workflows/ci.yml`, update the `test` job to build the dist before running tests:

```yaml
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run build
      - run: bun run test
```

- [ ] **Step 2: Check release.yml for the same pattern**

```bash
cat .github/workflows/release.yml
```

If `release.yml` has a `ci` or `test` job that runs `bun run test` without a preceding `bun run build`, apply the same fix there.

---

### Task 8: Commit

- [ ] **Step 1: Stage files**

```bash
git add vite.config.ts package.json bun.lock vitest.config.ts tests/dist.smoke.react18.test.tsx .github/workflows/ci.yml .github/workflows/release.yml
```

- [ ] **Step 2: Commit**

```bash
git commit -m "fix: externalize react/jsx-runtime to prevent React 18 crash

react/jsx-runtime was bundled into the dist instead of being treated as
an external. The bundled React 19 jsx-runtime reads
React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
which is undefined in React 18, causing a TypeError on first render.

Also moves react-dom from dependencies to peerDependencies, and adds a
vitest smoke-test project that imports the built artifact under React 18
so this class of regression is caught automatically."
```
