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

## CHANGELOG

Maintain `CHANGELOG.md` manually, following the [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format (Unreleased section at top, semantic versioning, grouped by Added/Changed/Deprecated/Removed/Fixed/Security).

## Key Design Decisions Still Open

- How to hook into RJSF's rendering lifecycle (custom widget? form wrapper? `transformErrors`?).
- Whether to mutate `formData` directly or produce a derived copy.
- How to handle circular formula dependencies.
