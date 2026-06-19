# 01 — Project scaffolding

Status: ready-for-agent

## Goal

Bootstrap the repository so that subsequent issues have a working build, test, and publish pipeline to build on.

## Acceptance criteria

- `package.json` is configured with:
  - `name: "rjsf-formulas"`
  - peer dependencies: `@rjsf/core >=5`, `@rjsf/utils >=5`, `react >=17`
  - dev dependencies: `@rjsf/core ^6`, `@rjsf/utils ^6`, `rjsf-core-v5: npm:@rjsf/core@^5`, `rjsf-utils-v5: npm:@rjsf/utils@^5`
  - `"type": "module"`
  - `exports` field with conditional `"import"` and `"require"` pointing to `dist/`
  - `prepublishOnly` script that runs `publint`
- `tsconfig.json` targets ESNext, strict mode, declaration emit on
- `vite.config.ts` in library mode, `formats: ['es', 'cjs']`, entry `src/index.ts`
- `vitest.config.ts` with two projects:
  - `rjsf-v6`: uses installed `@rjsf/core` / `@rjsf/utils`
  - `rjsf-v5`: resolves `@rjsf/core` → `rjsf-core-v5` and `@rjsf/utils` → `rjsf-utils-v5` via `resolve.alias`
- Husky installed with a pre-push hook that runs `publint` after build
- `src/index.ts` exports a placeholder `FormulaForm` (can just re-export `Form` from `@rjsf/core` for now)
- `npm run build` succeeds and emits `dist/index.mjs`, `dist/index.cjs`, and declaration files
- `npm test` runs the (empty) test suite against both RJSF versions without error
- `publint` passes on the built output

## References

See `SPEC.md` — Tooling section.
