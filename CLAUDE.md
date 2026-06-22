# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`rjsf-formulas` is a library extending [RJSF](https://github.com/rjsf-team/react-jsonschema-form) with computed fields driven by formulas embedded in a JSON schema. The project is currently in the ideation/design phase — see `IDEA.md` for the full spec.

## Core Design

Fields are marked as computed via a custom schema key (e.g. `x-formula`). The library evaluates the formula on render and on data change, setting the field value automatically and preventing direct user edits.

**Two context modes** (both keys are configurable):
- Default (`x-formula`): sibling fields are available by name in the formula context.
- Extended (`x-formula-context: "extended"`): full `formData` plus the path to the computed field are available — for cross-sibling or cross-object references.

**Evaluation strategy is user-supplied**: the library accepts an evaluator function `(formula: string, context: object) => value`. This keeps the library agnostic to the expression language.

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature-slug>/`. No GitHub remote is configured. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label strings are used (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo — one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Schemas

All schemas used in unit tests must be defined in `tests/schemas.ts` as named `DemoSchema` exports — never inline inside test files. This makes every test fixture automatically available to the demo app without any extra work.

## Testing — Red-Green TDD (REQUIRED)

**Every code change must follow strict red-green TDD. This is non-negotiable.**

1. **Write the test first** — before touching any implementation code.
2. **Run the test and confirm it fails (red)** — if the test passes before the implementation exists, the test is wrong (it isn't actually testing what you think).
3. **Write the minimum implementation to make the test pass (green).**
4. **Commit only when green** — never commit a failing test unless it is the designated "red" checkpoint before the fix.

This applies to bug fixes, new features, and edge cases alike. A test written after the implementation cannot prove the implementation is correct — it only proves the test and implementation agree.

## CHANGELOG

Maintain `CHANGELOG.md` manually, following the [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format (Unreleased section at top, semantic versioning, grouped by Added/Changed/Deprecated/Removed/Fixed/Security).

## Key Design Decisions Still Open

- How to hook into RJSF's rendering lifecycle (custom widget? form wrapper? `transformErrors`?).
- Whether to mutate `formData` directly or produce a derived copy.
- How to handle circular formula dependencies.
