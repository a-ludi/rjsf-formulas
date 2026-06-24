# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.2] - 2026-06-24

### Changed

- GitHub Actions: bump `actions/checkout` from v4 to v6 and `actions/setup-node` from v4 to v6 — both now run on Node.js 24, eliminating the Node 20 deprecation warnings in CI. (`actions/deploy-pages` and `actions/upload-pages-artifact` remain at their current versions pending upstream Node.js 24 releases.)
- Husky pre-push hook: remove legacy v8-era shebang and `_/husky.sh` source line, which Husky v10 will reject.
- `package.json`: prefix `repository.url` with `git+` to satisfy publint.

## [0.3.1] - 2026-06-23

### Fixed

- `analyzeSchema` now detects formulas inside array schemas that omit an explicit `type: 'array'` declaration. RJSF infers array type from the presence of `items` or `prefixItems`; the library now does the same.

## [0.3.0] - 2026-06-23

### Fixed

- `FormulaForm` now forwards refs to the inner RJSF `Form` instance via `React.forwardRef`, enabling programmatic access to the Form API (e.g. `ref.current.reset()`, `ref.current.submit()`, `ref.current.validateForm()`). Previously, any `ref` prop was silently discarded, producing a React warning on React 17/18 and accidentally working on React 19 only through prop spread.

## [0.2.0] - 2026-06-22

### Added

- Composite schema support: `analyzeSchema` now recurses into `$ref`, `allOf`, `oneOf`, `anyOf`, and `if`/`then`/`else` branches to collect formula fields from all branches.
- `FormulaField.condition: RJSFSchema | true` — each discovered field carries the JSON Schema condition under which it is active (`true` = always active).
- At evaluation time, `enrich` calls `validator.isValid(condition, formData, rootSchema)` to determine which fields are active; only active fields are evaluated.
- `formulaConflictBehavior: 'ignore' | 'warn' | 'error'` option on `analyzeSchema` and prop on `FormulaForm` (default `'warn'`) — controls what happens when multiple simultaneously-active branches define a formula for the same path.
- `formulaConflictBehavior: 'error'` throws a `TypeError` synchronously, intended as a developer tool for aggressive schema validation during development.

### Fixed

- Formula evaluation silently fails in apps using `<React.StrictMode>`: computed values are never applied and `onChange` is never called with enriched data. Root cause: two lifecycle refs (`isUnmountedRef`, `hasMountedRef`) were not reset on remount, causing the evaluation sequence to exit early after StrictMode's simulated unmount+remount cycle.

## [0.1.3] - 2026-06-22

### Fixed

- Externalize `react/jsx-runtime` and `react/jsx-dev-runtime` in the Vite library build so they are no longer bundled into the dist. The previously bundled React 19 jsx-runtime read `React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE`, which is undefined in React 18, crashing any consumer on React 18 (fixes [#1](https://github.com/a-ludi/rjsf-formulas/issues/1)).
- Move `react-dom` from `dependencies` to `peerDependencies` so consumers bring their own instead of getting a pinned version as a transitive dependency.

## [0.1.2] - 2026-06-20

### Fixed

- Set `entryFileName: index` in TypeDoc config so VitePress correctly serves `/api/` as the API reference index.

## [0.1.1] - 2026-06-20

### Fixed

- Import `FormProps` and `IChangeEvent` from `@rjsf/core` (not `@rjsf/utils`) to resolve TypeScript type errors.
- Resolve pre-existing TypeScript errors in test files (`setup.rjsf-v5.ts`, `mergeReadOnly.test.ts`, `FormulaForm.test.tsx`, `useAsyncFormulas.test.tsx`).
- Use `bun run test` in CI workflows to invoke Vitest (not bun's native test runner), fixing DOM-dependent tests in GitHub Actions.
- Use `bunx husky` in `prepare` script so `bun pm pack` can find it during the release workflow.
- Bump Node.js to 22 and upgrade npm to 11.5.1+ in the release workflow, required for npm Trusted Publishers OIDC authentication.

## [0.1.0] - 2026-06-20

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

[Unreleased]: https://github.com/a-ludi/rjsf-formulas/compare/v0.3.2...HEAD
[0.3.2]: https://github.com/a-ludi/rjsf-formulas/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/a-ludi/rjsf-formulas/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/a-ludi/rjsf-formulas/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/a-ludi/rjsf-formulas/compare/v0.1.3...v0.2.0
[0.1.3]: https://github.com/a-ludi/rjsf-formulas/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/a-ludi/rjsf-formulas/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/a-ludi/rjsf-formulas/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/a-ludi/rjsf-formulas/releases/tag/v0.1.0
