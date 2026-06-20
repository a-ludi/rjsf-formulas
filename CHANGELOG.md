# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/a-ludi/rjsf-formulas/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/a-ludi/rjsf-formulas/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/a-ludi/rjsf-formulas/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/a-ludi/rjsf-formulas/releases/tag/v0.1.0
