# Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish `@a-ludi/rjsf-formulas` to npm and GitHub Packages, with CI/CD via GitHub Actions, a VitePress documentation site with auto-generated API reference, and a live demo — all deployed to GitHub Pages on version tag push.

**Architecture:** Two GitHub Actions workflows: `ci.yml` (typecheck + test on every push/PR) and `release.yml` (triggered by `v*` tags: publish to npm via OIDC + GitHub Packages via GITHUB_TOKEN, then build and deploy VitePress docs + demo to GitHub Pages). A `website/` directory holds the VitePress project; TypeDoc generates API reference markdown into `website/api/` before the VitePress build.

**Tech Stack:** Bun 1.3.14, VitePress, TypeDoc + typedoc-plugin-markdown, GitHub Actions (`oven-sh/setup-bun`, `actions/setup-node`, `actions/deploy-pages`), npm Trusted Publishers (OIDC).

---

## File Map

**Create:**
- `LICENSE` — MIT license
- `README.md` — overview, install, usage, security warning, links
- `CHANGELOG.md` — Keep a Changelog format, initial skeleton
- `.github/workflows/ci.yml` — typecheck + test on push/PR
- `.github/workflows/release.yml` — publish + deploy on `v*` tags
- `website/.vitepress/config.ts` — VitePress site config with nav/sidebar/cross-links
- `website/index.md` — VitePress home page (hero)
- `website/quick-start.md` — installation and first usage
- `website/customization.md` — all FormulaFormProps knobs documented
- `typedoc.json` — TypeDoc config pointing at `src/index.ts`, output to `website/api/`

**Modify:**
- `package.json` — rename to `@a-ludi/rjsf-formulas`, add metadata fields, add build scripts, add `publishConfig`
- `.gitignore` — add `website/api/`, `website/.vitepress/cache/`, `*.tgz`
- `src/analyzeSchema.ts` — add JSDoc to `ContextMode`, `FormulaField`, `AnalyzeSchemaOptions`, `analyzeSchema`; mark `ARRAY_INDEX` / `ArrayIndex` `@internal`
- `src/FormulaForm.tsx` — add JSDoc to `FormulaFormProps` (all fields) and `FormulaForm`
- `src/index.ts` — add module-level JSDoc block
- `demo/App.tsx` — add header with links to docs and GitHub repo

---

## Task 1: Update `package.json`

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Apply metadata changes**

Replace the `"name"` field and add new fields. The final `package.json` top-level fields (preserve all existing fields unchanged; only add/replace these):

```json
{
  "name": "@a-ludi/rjsf-formulas",
  "version": "0.1.0",
  "description": "RJSF extension for computed fields driven by formulas",
  "author": "Arne Ludwig <arne.ludwig@posteo.de>",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/a-ludi/rjsf-formulas.git"
  },
  "homepage": "https://a-ludi.github.io/rjsf-formulas/",
  "publishConfig": {
    "access": "public"
  }
}
```

Add these build scripts alongside the existing ones:

```json
"build:docs": "typedoc && vitepress build website",
"build:demo": "vite build --config demo/vite.config.ts"
```

- [ ] **Step 2: Verify build still works**

```bash
bun run build
```

Expected: `dist/` is produced, no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: rename package to @a-ludi/rjsf-formulas, add publish metadata"
```

---

## Task 2: Create `LICENSE`

**Files:**
- Create: `LICENSE`

- [ ] **Step 1: Write the file**

```
MIT License

Copyright (c) 2026 Arne Ludwig

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Commit**

```bash
git add LICENSE
git commit -m "chore: add MIT license"
```

---

## Task 3: Create `CHANGELOG.md`

**Files:**
- Create: `CHANGELOG.md`

- [ ] **Step 1: Write the file**

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - YYYY-MM-DD

### Added

- `FormulaForm` component: drop-in replacement for RJSF's `<Form>` with computed field support.
- Formula evaluation via user-supplied `evaluator` function (sync or async).
- Default context mode (`siblings`): formula context contains the computed field's sibling values.
- Extended context mode (`x-formula-context: "extended"`): formula context additionally contains the full form data and the field's path.
- Debounced async evaluation with configurable `debounceMs`.
- Stale-result suppression: results from superseded evaluations are discarded.
- `onFormulaError` callback for per-field error handling.
- `onLoadingChange` callback for tracking in-progress async evaluations.
- `analyzeSchema` utility: scans a JSON Schema and returns all formula field descriptors.
- All schema keys and context injection keys are configurable via props.

[Unreleased]: https://github.com/a-ludi/rjsf-formulas/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/a-ludi/rjsf-formulas/releases/tag/v0.1.0
```

Replace `YYYY-MM-DD` with the actual release date before tagging.

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "chore: add CHANGELOG skeleton for 0.1.0"
```

---

## Task 4: Polish JSDoc — `src/analyzeSchema.ts`

**Files:**
- Modify: `src/analyzeSchema.ts`

- [ ] **Step 1: Add `@internal` to `ARRAY_INDEX` and `ArrayIndex`**

Replace the existing lines:

```typescript
/** Package-internal — not re-exported from the public entry point. Used by enrich.ts and mergeReadOnly.ts. */
export const ARRAY_INDEX: unique symbol = Symbol('arrayIndex')
export type ArrayIndex = typeof ARRAY_INDEX
```

With:

```typescript
/**
 * Sentinel used in formula field paths to represent a uniform array item position.
 * @internal
 */
export const ARRAY_INDEX: unique symbol = Symbol('arrayIndex')

/** @internal */
export type ArrayIndex = typeof ARRAY_INDEX
```

- [ ] **Step 2: Add JSDoc to `ContextMode`**

Replace:

```typescript
export type ContextMode = 'siblings' | 'extended'
```

With:

```typescript
/**
 * Controls which values are injected into the formula evaluation context.
 *
 * - `'siblings'` (default): only the sibling fields of the computed field are available by name.
 * - `'extended'`: the full form data and the field's resolved path are additionally injected
 *   under the keys configured by `formulaDataKey` and `formulaPathKey`.
 *
 * Set via the `x-formula-context` schema key (or the `formulaContextKey` prop).
 */
export type ContextMode = 'siblings' | 'extended'
```

- [ ] **Step 3: Add JSDoc to `FormulaField`**

Replace:

```typescript
export type FormulaField = {
  path: (string | number | ArrayIndex)[]
  formula: string
  contextMode: ContextMode
}
```

With:

```typescript
/**
 * Describes a single computed field discovered by {@link analyzeSchema}.
 */
export type FormulaField = {
  /** JSON path to the field within the form data. Uniform array item positions are represented by {@link ARRAY_INDEX}. */
  path: (string | number | ArrayIndex)[]
  /** The raw formula string from the schema. */
  formula: string
  /** Which values are available when evaluating this field's formula. */
  contextMode: ContextMode
}
```

- [ ] **Step 4: Add JSDoc to `AnalyzeSchemaOptions`**

Replace:

```typescript
export type AnalyzeSchemaOptions = {
  formulaKey?: string
  formulaContextKey?: string
}
```

With:

```typescript
/**
 * Options for {@link analyzeSchema}.
 */
export type AnalyzeSchemaOptions = {
  /** Schema key that marks a field as computed. Defaults to `'x-formula'`. */
  formulaKey?: string
  /** Schema key that selects the context mode for a computed field. Defaults to `'x-formula-context'`. */
  formulaContextKey?: string
}
```

- [ ] **Step 5: Add JSDoc to `analyzeSchema`**

Replace:

```typescript
export function analyzeSchema(
  schema: RJSFSchema,
  options?: AnalyzeSchemaOptions
): FormulaField[] {
```

With:

```typescript
/**
 * Scans a JSON Schema and returns descriptors for every field that carries a formula key.
 *
 * @remarks
 * Traversal is depth-first. Schema composition operators (`$ref`, `oneOf`, `anyOf`, `allOf`)
 * are not supported and emit a `console.warn` when encountered.
 *
 * @param schema - The root RJSF schema to scan.
 * @param options - Optional key overrides for locating formulas in the schema.
 * @returns An array of {@link FormulaField} descriptors, one per computed field found.
 *
 * @example
 * ```ts
 * import { analyzeSchema } from '@a-ludi/rjsf-formulas'
 *
 * const fields = analyzeSchema({
 *   type: 'object',
 *   properties: {
 *     price: { type: 'number' },
 *     total: { type: 'number', 'x-formula': 'price * 2' },
 *   },
 * })
 * // fields[0].path    → ['total']
 * // fields[0].formula → 'price * 2'
 * ```
 */
export function analyzeSchema(
  schema: RJSFSchema,
  options?: AnalyzeSchemaOptions
): FormulaField[] {
```

- [ ] **Step 6: Verify TypeScript still compiles**

```bash
bunx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/analyzeSchema.ts
git commit -m "docs: add JSDoc to analyzeSchema public API"
```

---

## Task 5: Polish JSDoc — `src/FormulaForm.tsx` and `src/index.ts`

**Files:**
- Modify: `src/FormulaForm.tsx`
- Modify: `src/index.ts`

- [ ] **Step 1: Add JSDoc to `FormulaFormProps`**

Replace:

```typescript
export type FormulaFormProps<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any
> = FormProps<T, S, F> & {
  evaluator: (formula: string, context: object) => unknown | Promise<unknown>
  Form?: React.ComponentType<FormProps<T, S, F>>
  formulaKey?: string
  formulaContextKey?: string
  formulaDataKey?: string
  formulaPathKey?: string
  maxConvergencePasses?: number
  debounceMs?: number
  onFormulaError?: (path: (string | number)[], error: Error) => void
  onLoadingChange?: (loadingPaths: (string | number)[][]) => void
}
```

With:

```typescript
/**
 * Props accepted by {@link FormulaForm}.
 *
 * Extends all standard RJSF `FormProps` with formula-specific configuration.
 * All formula-specific props are optional except `evaluator`.
 */
export type FormulaFormProps<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any
> = FormProps<T, S, F> & {
  /**
   * Evaluates a formula string against a context object and returns the computed value.
   *
   * @remarks
   * May return a plain value or a `Promise`. For user-supplied formulas, **do not use `eval`**
   * — it allows arbitrary code execution. Prefer a sandboxed evaluator such as
   * [`expr-eval`](https://github.com/silentmatt/expr-eval) or
   * [`mathjs`](https://mathjs.org/), or run evaluation in a Web Worker.
   *
   * @param formula - The formula string from the schema.
   * @param context - Sibling field values, or full form data in extended mode.
   * @returns The computed value, or a Promise resolving to it.
   */
  evaluator: (formula: string, context: object) => unknown | Promise<unknown>

  /**
   * Inner RJSF `Form` component to render.
   * Defaults to `Form` from `@rjsf/core`. Swap to use a themed form
   * (e.g. `Form` from `@rjsf/bootstrap-4`).
   */
  Form?: React.ComponentType<FormProps<T, S, F>>

  /** Schema key that marks a field as computed. Defaults to `'x-formula'`. */
  formulaKey?: string

  /** Schema key that selects the context mode for a field. Defaults to `'x-formula-context'`. */
  formulaContextKey?: string

  /**
   * Key injected into the extended context carrying the full form data.
   * Defaults to `'__formData__'`. Override if a sibling field uses the same name.
   */
  formulaDataKey?: string

  /**
   * Key injected into the extended context carrying the field's resolved path.
   * Defaults to `'__path__'`. Override if a sibling field uses the same name.
   */
  formulaPathKey?: string

  /**
   * Maximum number of re-evaluation passes triggered by a single input event.
   * Guards against infinite loops from circular formula dependencies. Defaults to `10`.
   */
  maxConvergencePasses?: number

  /**
   * Milliseconds to debounce formula evaluation after a user input event. Defaults to `300`.
   * Set to `0` to evaluate synchronously (only safe with synchronous evaluators).
   */
  debounceMs?: number

  /**
   * Called when a formula throws during evaluation.
   * @param path - JSON path of the field whose formula failed.
   * @param error - The error thrown by the evaluator.
   */
  onFormulaError?: (path: (string | number)[], error: Error) => void

  /**
   * Called whenever the set of currently-evaluating fields changes.
   * Useful for showing per-field loading indicators.
   * @param loadingPaths - Paths of all fields whose evaluations are in progress.
   */
  onLoadingChange?: (loadingPaths: (string | number)[][]) => void
}
```

- [ ] **Step 2: Add JSDoc to `FormulaForm`**

Replace:

```typescript
export function FormulaForm<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any
>(props: FormulaFormProps<T, S, F>): JSX.Element {
```

With:

```typescript
/**
 * Drop-in replacement for RJSF's `<Form>` with support for computed fields.
 *
 * @remarks
 * Fields marked with a formula key in the JSON schema are evaluated automatically
 * on every data change and rendered as read-only. The `evaluator` prop receives
 * the formula string and a context object, and returns the computed value.
 *
 * @example
 * ```tsx
 * import { FormulaForm } from '@a-ludi/rjsf-formulas'
 * import validator from '@rjsf/validator-ajv8'
 * import { Parser } from 'expr-eval'
 *
 * const parser = new Parser()
 *
 * const schema = {
 *   type: 'object' as const,
 *   properties: {
 *     price:    { type: 'number' as const },
 *     quantity: { type: 'number' as const },
 *     total:    { type: 'number' as const, 'x-formula': 'price * quantity' },
 *   },
 * }
 *
 * function MyForm() {
 *   return (
 *     <FormulaForm
 *       schema={schema}
 *       validator={validator}
 *       evaluator={(formula, ctx) => parser.evaluate(formula, ctx)}
 *     />
 *   )
 * }
 * ```
 */
export function FormulaForm<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any
>(props: FormulaFormProps<T, S, F>): JSX.Element {
```

- [ ] **Step 3: Add module-level JSDoc to `src/index.ts`**

Prepend to the file:

```typescript
/**
 * @packageDocumentation
 *
 * `@a-ludi/rjsf-formulas` — RJSF extension for computed fields driven by formulas.
 *
 * @example Install
 * ```sh
 * npm install @a-ludi/rjsf-formulas
 * ```
 *
 * @example Basic usage
 * ```tsx
 * import { FormulaForm } from '@a-ludi/rjsf-formulas'
 * import validator from '@rjsf/validator-ajv8'
 *
 * <FormulaForm
 *   schema={schema}
 *   validator={validator}
 *   evaluator={(formula, ctx) => /* your evaluator *\/ }
 * />
 * ```
 */
```

- [ ] **Step 4: Verify TypeScript still compiles**

```bash
bunx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/FormulaForm.tsx src/index.ts
git commit -m "docs: add JSDoc to FormulaForm and package entry point"
```

---

## Task 6: Install VitePress and TypeDoc

**Files:**
- Modify: `package.json`, `bun.lock` (auto-updated)

- [ ] **Step 1: Install dependencies**

```bash
bun add -d vitepress typedoc typedoc-plugin-markdown
```

Expected: packages added to `devDependencies`, `bun.lock` updated.

- [ ] **Step 2: Verify installs**

```bash
bunx vitepress --version
bunx typedoc --version
```

Expected: version strings printed, no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "chore: add vitepress, typedoc, typedoc-plugin-markdown as dev deps"
```

---

## Task 7: Configure VitePress — config and home page

**Files:**
- Create: `website/.vitepress/config.ts`
- Create: `website/index.md`

- [ ] **Step 1: Write VitePress config**

```typescript
// website/.vitepress/config.ts
import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'rjsf-formulas',
  description: 'RJSF extension for computed fields driven by formulas',
  base: '/rjsf-formulas/',
  themeConfig: {
    nav: [
      { text: 'Quick Start', link: '/quick-start' },
      { text: 'Customization', link: '/customization' },
      { text: 'API', link: '/api/' },
      { text: 'Live Demo', link: 'https://a-ludi.github.io/rjsf-formulas/demo/' },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Quick Start', link: '/quick-start' },
          { text: 'Customization', link: '/customization' },
        ],
      },
      {
        text: 'API Reference',
        items: [
          { text: 'Overview', link: '/api/' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/a-ludi/rjsf-formulas' },
    ],
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 Arne Ludwig',
    },
    editLink: {
      pattern: 'https://github.com/a-ludi/rjsf-formulas/edit/main/website/:path',
    },
  },
})
```

- [ ] **Step 2: Write home page**

```markdown
---
layout: home

hero:
  name: rjsf-formulas
  text: Computed fields for RJSF
  tagline: Embed formula-driven computed fields directly in your JSON schema. Works with any expression language.
  actions:
    - theme: brand
      text: Quick Start
      link: /quick-start
    - theme: alt
      text: Live Demo
      link: https://a-ludi.github.io/rjsf-formulas/demo/
    - theme: alt
      text: GitHub
      link: https://github.com/a-ludi/rjsf-formulas

features:
  - title: Schema-driven
    details: Mark fields as computed directly in your JSON schema using a custom key. No extra configuration needed.
  - title: Evaluator-agnostic
    details: Bring your own expression language. Supply an evaluator function — synchronous or async — and rjsf-formulas handles the rest.
  - title: Async-ready
    details: Async evaluators are fully supported, with debouncing, loading state tracking, and stale-result suppression built in.
---
```

- [ ] **Step 3: Verify VitePress dev server starts**

```bash
bunx vitepress dev website
```

Expected: server starts at `http://localhost:5173/rjsf-formulas/`, home page renders. Stop with Ctrl-C.

- [ ] **Step 4: Commit**

```bash
git add website/
git commit -m "docs: add VitePress site config and home page"
```

---

## Task 8: Write Quick Start guide

**Files:**
- Create: `website/quick-start.md`

- [ ] **Step 1: Write the guide**

````markdown
# Quick Start

## Prerequisites

- An existing project using [RJSF](https://github.com/rjsf-team/react-jsonschema-form) (`@rjsf/core` ≥ 5 and `@rjsf/utils` ≥ 5).
- React ≥ 17.

## Installation

```sh
npm install @a-ludi/rjsf-formulas
```

## Define a schema with computed fields

Add the `x-formula` key to any field you want to compute automatically:

```json
{
  "type": "object",
  "properties": {
    "price":    { "type": "number", "title": "Price" },
    "quantity": { "type": "number", "title": "Quantity" },
    "total":    { "type": "number", "title": "Total", "x-formula": "price * quantity" }
  }
}
```

The `total` field will be kept read-only and updated automatically whenever `price` or `quantity` changes.

## Render the form

Replace RJSF's `<Form>` with `<FormulaForm>` and supply an `evaluator`:

```tsx
import { FormulaForm } from '@a-ludi/rjsf-formulas'
import validator from '@rjsf/validator-ajv8'
import { Parser } from 'expr-eval'

const parser = new Parser()

const schema = {
  type: 'object' as const,
  properties: {
    price:    { type: 'number' as const, title: 'Price' },
    quantity: { type: 'number' as const, title: 'Quantity' },
    total:    { type: 'number' as const, title: 'Total', 'x-formula': 'price * quantity' },
  },
}

export function MyForm() {
  return (
    <FormulaForm
      schema={schema}
      validator={validator}
      evaluator={(formula, ctx) => parser.evaluate(formula, ctx)}
    />
  )
}
```

`FormulaForm` accepts all the same props as RJSF's `<Form>`, so you can add `formData`, `onChange`, `onSubmit`, custom widgets, and everything else you would normally use.

## What happens

1. On mount, `total` is computed from the initial `price` and `quantity` values.
2. When the user changes `price` or `quantity`, the formula is re-evaluated (debounced by 300 ms by default).
3. The `total` field is rendered as read-only — the user cannot edit it directly.

## Next steps

- See [Customization](/customization) for all available props.
- Try the [live demo](https://a-ludi.github.io/rjsf-formulas/demo/) to explore different schema configurations interactively.
````

- [ ] **Step 2: Verify page renders in dev**

```bash
bunx vitepress dev website
```

Navigate to `http://localhost:5173/rjsf-formulas/quick-start`. Verify the page renders correctly. Stop with Ctrl-C.

- [ ] **Step 3: Commit**

```bash
git add website/quick-start.md
git commit -m "docs: write Quick Start guide"
```

---

## Task 9: Write Customization guide

**Files:**
- Create: `website/customization.md`

- [ ] **Step 1: Write the guide**

````markdown
# Customization

## Evaluator

The `evaluator` prop is the only required addition to RJSF's standard props. It receives a formula string and a context object, and returns the computed value (or a Promise).

```tsx
<FormulaForm
  schema={schema}
  validator={validator}
  evaluator={(formula, ctx) => myEvaluator(formula, ctx)}
/>
```

You can use any expression library. Popular choices:
- [`expr-eval`](https://github.com/silentmatt/expr-eval) — safe, no `eval`, supports arithmetic and basic functions
- [`mathjs`](https://mathjs.org/) — full math library, supports units and complex numbers
- A Web Worker running a restricted evaluator — best isolation for untrusted input

::: warning Security
**Never use `eval` with user-supplied formulas.** Formulas are evaluated in the browser, and `eval` gives untrusted code full access to the JavaScript environment. Use a sandboxed evaluator instead.
:::

## Async evaluators

If your evaluator returns a Promise, `rjsf-formulas` handles the async lifecycle automatically:

```tsx
<FormulaForm
  schema={schema}
  validator={validator}
  evaluator={async (formula, ctx) => {
    const result = await myRemoteEvaluator(formula, ctx)
    return result
  }}
  onLoadingChange={(paths) => console.log('Evaluating:', paths)}
/>
```

Stale results from superseded evaluations are discarded — if the user types again before an evaluation finishes, the outdated result is never applied.

## Debounce

Formula evaluation is debounced after user input. The default is 300 ms.

```tsx
<FormulaForm
  evaluator={...}
  debounceMs={500}   // wait 500 ms after the last keystroke
/>
```

Set `debounceMs={0}` to evaluate immediately — only safe with synchronous evaluators.

## Schema keys

The formula key and context key are configurable. Use this if `x-formula` conflicts with another tool's schema extensions:

```tsx
<FormulaForm
  evaluator={...}
  formulaKey="x-compute"
  formulaContextKey="x-compute-context"
/>
```

Your schema would then use `x-compute` instead of `x-formula`.

## Context modes

### Siblings (default)

By default, the formula context contains only the sibling fields of the computed field:

```json
{
  "type": "object",
  "properties": {
    "a": { "type": "number" },
    "b": { "type": "number" },
    "sum": { "type": "number", "x-formula": "a + b" }
  }
}
```

In the formula for `sum`, `a` and `b` are available by name.

### Extended

Set `x-formula-context: "extended"` to access the full form data and the field's own path:

```json
{
  "type": "object",
  "properties": {
    "order": {
      "type": "object",
      "properties": {
        "price":    { "type": "number" },
        "quantity": { "type": "number" }
      }
    },
    "total": {
      "type": "number",
      "x-formula": "__formData__.order.price * __formData__.order.quantity",
      "x-formula-context": "extended"
    }
  }
}
```

The injected keys default to `__formData__` and `__path__`. Override them if a sibling field uses the same name:

```tsx
<FormulaForm
  evaluator={...}
  formulaDataKey="$data"
  formulaPathKey="$path"
/>
```

## Error handling

Provide `onFormulaError` to handle evaluation errors gracefully instead of crashing:

```tsx
<FormulaForm
  evaluator={...}
  onFormulaError={(path, error) => {
    console.error(`Formula error at ${path.join('.')}:`, error.message)
  }}
/>
```

## Loading indicators

Use `onLoadingChange` to show spinners or disabled states while async formulas are running:

```tsx
const [loading, setLoading] = useState(false)

<FormulaForm
  evaluator={...}
  onLoadingChange={(paths) => setLoading(paths.length > 0)}
/>
```

## Swapping the inner Form component

`FormulaForm` renders a `Form` from `@rjsf/core` by default. Pass a themed form to use Bootstrap, Material UI, or another theme:

```tsx
import BootstrapForm from '@rjsf/bootstrap-4'

<FormulaForm
  Form={BootstrapForm}
  evaluator={...}
  schema={schema}
  validator={validator}
/>
```

## Convergence limit

For schemas where one formula field's value feeds into another, `rjsf-formulas` re-evaluates until the output stabilises. The default limit is 10 passes:

```tsx
<FormulaForm
  evaluator={...}
  maxConvergencePasses={5}
/>
```

If the limit is reached without convergence, evaluation stops and the last computed values are used. Circular dependencies will always hit this limit.
````

- [ ] **Step 2: Commit**

```bash
git add website/customization.md
git commit -m "docs: write Customization guide"
```

---

## Task 10: Configure TypeDoc

**Files:**
- Create: `typedoc.json`

- [ ] **Step 1: Write TypeDoc config**

```json
{
  "entryPoints": ["src/index.ts"],
  "entryPointStrategy": "resolve",
  "plugin": ["typedoc-plugin-markdown"],
  "out": "website/api",
  "readme": "none",
  "hidePageHeader": true,
  "hideBreadcrumbs": true,
  "excludePrivate": true,
  "excludeInternal": true,
  "gitRevision": "main"
}
```

- [ ] **Step 2: Generate API docs and verify output**

```bash
bunx typedoc
```

Expected: `website/api/` directory created with markdown files. Check that `website/api/README.md` or `website/api/index.md` exists and contains entries for `FormulaForm`, `analyzeSchema`, and the public types.

- [ ] **Step 3: Update `.gitignore` with generated build paths**

Append to the existing `.gitignore` (which already has `node_modules/` and `dist/`):

```
website/api/
website/.vitepress/cache/
*.tgz
```

- [ ] **Step 4: Verify VitePress builds with generated API docs**

```bash
bunx typedoc && bunx vitepress build website
```

Expected: `website/.vitepress/dist/` created with no errors.

- [ ] **Step 5: Commit**

```bash
git add typedoc.json .gitignore
git commit -m "docs: add TypeDoc config, gitignore generated API output"
```

---

## Task 11: Add cross-links to demo app

**Files:**
- Modify: `demo/App.tsx`

- [ ] **Step 1: Add a link bar at the top of the App component's return**

In `demo/App.tsx`, find the opening `<div>` and `<h1>` inside the return statement:

```tsx
  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1 style={{ marginTop: 0 }}>rjsf-formulas demo</h1>
```

Replace with:

```tsx
  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '2rem', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
        <a href="https://a-ludi.github.io/rjsf-formulas/" target="_blank" rel="noopener noreferrer">
          Documentation
        </a>
        <a href="https://github.com/a-ludi/rjsf-formulas" target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
      </div>
      <h1 style={{ marginTop: 0 }}>rjsf-formulas demo</h1>
```

- [ ] **Step 2: Verify the demo still starts**

```bash
bun run dev
```

Expected: dev server starts, demo page shows the two links at the top. Stop with Ctrl-C.

- [ ] **Step 3: Commit**

```bash
git add demo/App.tsx
git commit -m "feat: add docs and GitHub links to demo app header"
```

---

## Task 12: Write `README.md`

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write the file**

````markdown
# rjsf-formulas

RJSF extension for computed fields driven by formulas embedded in a JSON schema.

**[Documentation](https://a-ludi.github.io/rjsf-formulas/) · [Live Demo](https://a-ludi.github.io/rjsf-formulas/demo/) · [GitHub](https://github.com/a-ludi/rjsf-formulas)**

## Overview

`rjsf-formulas` is a React library that extends [RJSF](https://github.com/rjsf-team/react-jsonschema-form) with computed fields. Fields marked with a formula key in the JSON schema are evaluated automatically on every data change — the user cannot edit them directly.

```json
{
  "type": "object",
  "properties": {
    "price":    { "type": "number" },
    "quantity": { "type": "number" },
    "total":    { "type": "number", "x-formula": "price * quantity" }
  }
}
```

## Installation

```sh
npm install @a-ludi/rjsf-formulas
```

Peer dependencies: `@rjsf/core ≥ 5`, `@rjsf/utils ≥ 5`, `react ≥ 17`.

## Usage

```tsx
import { FormulaForm } from '@a-ludi/rjsf-formulas'
import validator from '@rjsf/validator-ajv8'
import { Parser } from 'expr-eval'

const parser = new Parser()

function MyForm() {
  return (
    <FormulaForm
      schema={schema}
      validator={validator}
      evaluator={(formula, ctx) => parser.evaluate(formula, ctx)}
    />
  )
}
```

`FormulaForm` is a drop-in replacement for RJSF's `<Form>` — it accepts all the same props.

## Security

**Do not use `eval` as the evaluator with user-supplied formulas.**

`eval` gives untrusted code unrestricted access to the JavaScript environment, which can lead to arbitrary code execution and XSS attacks. If the formulas in your schema come from user input, use a sandboxed evaluator instead:

- [`expr-eval`](https://github.com/silentmatt/expr-eval) — safe parser with no `eval`, supports arithmetic and common math functions
- [`mathjs`](https://mathjs.org/) — full math library with a safe expression parser
- A [Web Worker](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API) running a restricted evaluator — strongest isolation

Using `eval` is only appropriate when formulas are authored by trusted developers and shipped as part of the application code.

## Documentation

Full documentation including the Customization guide and API reference is at:  
**<https://a-ludi.github.io/rjsf-formulas/>**

## License

MIT © 2026 Arne Ludwig
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with overview, install, usage, and security section"
```

---

## Task 13: Create CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bunx tsc --noEmit

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun test
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add CI workflow (typecheck + test on push/PR)"
```

---

## Task 14: Create release workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bunx tsc --noEmit
      - run: bun test

  publish:
    needs: ci
    runs-on: ubuntu-latest
    permissions:
      contents: write    # create GitHub Release
      packages: write    # publish to GitHub Packages
      id-token: write    # npm OIDC (Trusted Publishers)
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Build
        run: bun run build

      - name: Validate package
        run: bunx publint

      - name: Pack
        run: bun pm pack

      # npm — Trusted Publishers (OIDC, no stored secret)
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'

      - name: Publish to npm
        run: npm publish *.tgz --access public --provenance

      # GitHub Packages
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://npm.pkg.github.com'

      - name: Publish to GitHub Packages
        run: npm publish *.tgz --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract release notes
        id: notes
        run: |
          VERSION="${GITHUB_REF#refs/tags/v}"
          NOTES=$(awk "/^## \[$VERSION\]/{found=1;next} /^## \[/{if(found)exit} found{print}" CHANGELOG.md)
          {
            printf 'NOTES<<EOF\n'
            printf '%s\n' "$NOTES"
            printf 'EOF\n'
          } >> "$GITHUB_OUTPUT"

      - name: Create GitHub Release
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh release create "${GITHUB_REF#refs/tags/}" \
            --title "${GITHUB_REF#refs/tags/}" \
            --notes "${{ steps.notes.outputs.NOTES }}"

  deploy:
    needs: publish
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Generate API docs
        run: bunx typedoc

      - name: Build docs site
        run: bunx vitepress build website

      - name: Build demo
        run: bun run build:demo --base /rjsf-formulas/demo/

      - name: Copy demo into docs output
        run: cp -r demo/dist website/.vitepress/dist/demo

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: website/.vitepress/dist

      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add release workflow (publish + deploy on v* tags)"
```

---

## Task 15: Create GitHub repository and push

**Files:** none (git operations only)

- [ ] **Step 1: Create the remote repository**

```bash
GH_TOKEN=$(cat .claude/github_token | tr -d '[:space:]') \
  gh repo create a-ludi/rjsf-formulas \
  --public \
  --description "RJSF extension for computed fields driven by formulas"
```

Expected: repository created at `https://github.com/a-ludi/rjsf-formulas`.

- [ ] **Step 2: Add remote and push**

```bash
TOKEN=$(cat .claude/github_token | tr -d '[:space:]')
git remote add origin "https://a-ludi:${TOKEN}@github.com/a-ludi/rjsf-formulas.git"
git push -u origin main
```

Expected: all commits pushed, branch tracking set.

- [ ] **Step 3: Verify**

```bash
GH_TOKEN=$(cat .claude/github_token | tr -d '[:space:]') \
  gh repo view a-ludi/rjsf-formulas
```

Expected: repo details shown including description.

---

## Task 16: One-time manual setup checklist

These steps require browser access and cannot be automated. Perform them before pushing the first `v*` tag.

- [ ] **Step 1: Register the release workflow as an npm Trusted Publisher**

1. Log in to [npmjs.com](https://www.npmjs.com) and go to the `@a-ludi/rjsf-formulas` package page (or create it if it doesn't exist yet via your account's packages list).
2. Go to **Settings → Publishing access → Add a publisher**.
3. Fill in:
   - Owner type: **GitHub Actions**
   - Repository owner: `a-ludi`
   - Repository name: `rjsf-formulas`
   - Workflow filename: `release.yml`
   - Environment: *(leave blank)*
4. Save.

- [ ] **Step 2: Enable GitHub Pages**

1. Go to `https://github.com/a-ludi/rjsf-formulas/settings/pages`.
2. Under **Build and deployment → Source**, select **GitHub Actions**.
3. Save.

- [ ] **Step 3: Tag and release**

Fill in the actual release date in `CHANGELOG.md` (replace `YYYY-MM-DD`), commit, then push the first tag:

```bash
git add CHANGELOG.md
git commit -m "chore: set 0.1.0 release date in CHANGELOG"
git tag v0.1.0
git push origin main --tags
```

Expected: release workflow triggers on GitHub Actions, package published to npm and GitHub Packages, docs and demo deployed to GitHub Pages.
