# Fix Release Warnings & Deprecations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all warnings and deprecations that appeared during the 0.3.1 release — husky legacy format, two updatable GitHub Actions (checkout, setup-node), and the publint `repository.url` suggestion.

**Architecture:** Three independent config edits plus a CHANGELOG entry. No code changes, no tests required. Verified by re-running the pre-push hook locally and by checking CI annotations after pushing.

**Tech Stack:** Husky 9, GitHub Actions, publint, CHANGELOG (Keep a Changelog format)

---

## Warnings Identified

Three distinct warnings surfaced during the 0.3.1 release:

| # | Warning | Source | Fixable now? |
|---|---------|--------|-------------|
| 1 | Husky: "Please remove the following two lines … They WILL FAIL in v10.0.0" | pre-push hook running during `git push` | Yes |
| 2 | "Node.js 20 is deprecated … actions/checkout@v4" (ci, publish, deploy jobs) | GitHub Actions annotations | Partially — v6 exists for checkout and setup-node; deploy-pages and upload-pages-artifact have no Node 24 release yet (upstream issues #410 and #138) |
| 3 | publint: "pkg.repository.url … could be a full git URL like `git+https://…`" | pre-push hook and release publish step | Yes |

---

## Files Modified

- Modify: `.husky/pre-push` — remove legacy v8-era shebang and source lines
- Modify: `.github/workflows/ci.yml` — bump `actions/checkout` from v4 → v6
- Modify: `.github/workflows/release.yml` — bump `actions/checkout` v4 → v6, `actions/setup-node` v4 → v6
- Modify: `package.json` — prefix repository URL with `git+`
- Modify: `CHANGELOG.md` — record fixes under `[Unreleased]`

---

## Task 1: Fix Husky Hook Format

**Files:**
- Modify: `.husky/pre-push`

Husky v9 no longer needs a shebang or the `_/husky.sh` source line. They must be removed or the hook will break when husky v10 lands.

Current content:
```sh
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

bun run build && bunx publint
```

- [ ] **Step 1: Edit `.husky/pre-push`**

Replace the entire file with:
```
bun run build && bunx publint
```

(No shebang, no source line — just the command.)

- [ ] **Step 2: Verify the hook runs correctly**

Run the hook directly to confirm it still executes:
```bash
bun run build && bunx publint
```

Expected: build succeeds, publint reports only the `repository.url` suggestion (which Task 3 fixes).

- [ ] **Step 3: Stage the change**

```bash
git add .husky/pre-push
```

---

## Task 2: Update GitHub Actions — checkout and setup-node to v6

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/release.yml`

`actions/checkout@v6` and `actions/setup-node@v6` are the first major versions that internally run on Node.js 24. Replacing `@v4` with `@v6` removes the deprecation annotations for those two actions.

`actions/deploy-pages@v4` and `actions/upload-pages-artifact@v3` have no Node.js 24 release yet (upstream open issues: deploy-pages#410, upload-pages-artifact#138 and #143). Leave those at their current versions; their warnings will resolve once GitHub ships updated releases.

- [ ] **Step 1: Update `ci.yml`**

Replace both `actions/checkout@v4` occurrences:

```yaml
# was: uses: actions/checkout@v4
uses: actions/checkout@v6
```

The full updated file:
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
      - uses: actions/checkout@v6
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bunx tsc --noEmit

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run build
      - run: bun run test
```

- [ ] **Step 2: Update `release.yml`**

- Replace all three `actions/checkout@v4` occurrences with `actions/checkout@v6`
- Replace both `actions/setup-node@v4` occurrences with `actions/setup-node@v6`
- Leave `actions/deploy-pages@v4` and `actions/upload-pages-artifact@v3` unchanged

The full updated file:
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
      - uses: actions/checkout@v6
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bunx tsc --noEmit
      - run: bun run build
      - run: bun run test

  publish:
    needs: ci
    runs-on: ubuntu-latest
    permissions:
      contents: write
      packages: write
      id-token: write
    steps:
      - uses: actions/checkout@v6
      - uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Build
        run: bun run build

      - name: Validate package
        run: bunx publint

      - name: Pack
        run: bun pm pack

      - uses: actions/setup-node@v6
        with:
          node-version: '22'
          registry-url: 'https://registry.npmjs.org'

      - name: Upgrade npm
        run: npm install -g npm@latest

      - name: Publish to npm
        run: npm publish *.tgz --access public --provenance

      - uses: actions/setup-node@v6
        with:
          node-version: '22'
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
          NOTES: ${{ steps.notes.outputs.NOTES }}
        run: |
          printf '%s' "$NOTES" > /tmp/release-notes.txt
          gh release create "${GITHUB_REF#refs/tags/}" \
            --title "${GITHUB_REF#refs/tags/}" \
            --notes-file /tmp/release-notes.txt

  deploy:
    needs: publish
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
      contents: read
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v6
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

- [ ] **Step 3: Stage the changes**

```bash
git add .github/workflows/ci.yml .github/workflows/release.yml
```

---

## Task 3: Fix publint Repository URL Suggestion

**Files:**
- Modify: `package.json`

publint requires git URLs to use the `git+https://` scheme, not plain `https://`.

- [ ] **Step 1: Edit `package.json`**

Find:
```json
"url": "https://github.com/a-ludi/rjsf-formulas.git"
```

Replace with:
```json
"url": "git+https://github.com/a-ludi/rjsf-formulas.git"
```

- [ ] **Step 2: Verify publint is clean**

```bash
bunx publint
```

Expected: no output (no suggestions, no errors).

- [ ] **Step 3: Stage the change**

```bash
git add package.json
```

---

## Task 4: Update CHANGELOG and Commit

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add entries under `## [Unreleased]` in `CHANGELOG.md`**

```markdown
## [Unreleased]

### Changed

- GitHub Actions: bump `actions/checkout` from v4 to v6 and `actions/setup-node` from v4 to v6 — both now run on Node.js 24, eliminating the Node 20 deprecation warnings in CI. (`actions/deploy-pages` and `actions/upload-pages-artifact` remain at their current versions pending upstream Node.js 24 releases: deploy-pages#410, upload-pages-artifact#138.)
- Husky pre-push hook: remove legacy v8-era shebang and `_/husky.sh` source line, which Husky v10 will reject.
- `package.json`: prefix `repository.url` with `git+` to satisfy publint.
```

- [ ] **Step 2: Commit everything**

```bash
git commit -m "chore: fix release warnings (husky format, GH Actions Node 20, publint url)"
```

- [ ] **Step 3: Push to main and verify CI passes**

```bash
git push origin main
export GH_TOKEN=$(cat .claude/github_token)
gh run list --limit 3
gh run watch <run-id>
```

Expected: CI run completes green with **no** Node.js 20 deprecation annotations for `actions/checkout` or `actions/setup-node`. Annotations for `actions/deploy-pages` and `actions/upload-pages-artifact` may remain until upstream fixes those actions.

---

## Remaining Upstream Blockers

These two actions still emit deprecation warnings but have no Node.js 24 release to upgrade to:

| Action | Issue to track |
|--------|---------------|
| `actions/deploy-pages@v4` | https://github.com/actions/deploy-pages/issues/410 |
| `actions/upload-pages-artifact@v3` | https://github.com/actions/upload-pages-artifact/issues/138 (also #143) |

Check these issues periodically. When a new major (v5 for deploy-pages, v4/v5 for upload-pages-artifact) ships with Node.js 24 support, bump `release.yml` and add a CHANGELOG entry.
