# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/a-ludi/rjsf-formulas/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/a-ludi/rjsf-formulas/releases/tag/v0.1.0
