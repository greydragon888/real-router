# Changesets

This folder contains changeset files that describe changes to be included in the next release.

## Quick Start

```bash
# Create a new changeset interactively
pnpm changeset

# Create with a message (skip summary prompt)
pnpm changeset --message "Add noValidate option (#42)"

# Detect changed packages relative to a specific branch
pnpm changeset --since=develop

# Or create manually: .changeset/descriptive-name.md
```

## Principles

- **One package per file** — exactly one package in each changeset's frontmatter. A change spanning multiple packages becomes **separate changeset files**, one per package (cleaner CHANGELOG). Multi-package files are **rejected** by `pnpm lint:changeset` (pre-push).
- **One file per logical change** — each changeset describes one feature, fix, or refactor
- **Separate by type** — don't mix features, fixes, and performance improvements in one changeset
- **Public packages only** — skip private packages (`"private": true` in package.json)
- **Include PR/issue reference** — add `(#XX)` to title for traceability in release notes. Issue references like `#123` are auto-linked to GitHub in generated CHANGELOGs

## File Naming Convention

Use descriptive kebab-case names that reflect the change:

| Pattern                      | Example                         | Use Case                |
| ---------------------------- | ------------------------------- | ----------------------- |
| `{feature-name}-feature.md`  | `novalidate-feature.md`         | New feature             |
| `{area}-perf.md`             | `useplugin-perf.md`             | Performance improvement |
| `{component}-{issue}-fix.md` | `middleware-unsubscribe-fix.md` | Bug fix                 |
| `{area}-refactor.md`         | `validation-refactor.md`        | Internal refactoring    |

## File Format

**Single package (preferred):**

```markdown
---
"@real-router/core": minor
---

Short title describing the change (#XX)

Optional detailed description with context, examples, or migration notes.
```

A change that touches several packages is **one file per package** — never one
file listing many packages. See the separate-files example below.

### Frontmatter (YAML)

- **Package names** must match exactly (with quotes)
- **Version bump** must be one of: `major`, `minor`, `patch` (pre-1.0 packages never take `major` — use `minor` for breaking changes)
- Exactly **one public** package per file

### Description

- **First line** = short title (appears in CHANGELOG as bullet point)
- **Body** = optional details, examples, migration guide
- Use markdown formatting (code blocks, lists, links)

## Version Bump Guidelines

### Pre-1.0 Phase (Current)

| Change Type       | Bump    | Rationale                                |
| ----------------- | ------- | ---------------------------------------- |
| New feature       | `minor` | Adds functionality                       |
| Breaking change   | `minor` | Pre-1.0 allows breaking changes in minor |
| Bug fix           | `patch` | Fixes incorrect behavior                 |
| Performance       | `patch` | Improves existing functionality          |
| Internal refactor | `patch` | No API changes                           |
| Documentation     | `patch` | Improves clarity                         |

### Post-1.0 (Future)

Follow [Semantic Versioning](https://semver.org/):

- `major` — breaking changes
- `minor` — new features (backward compatible)
- `patch` — bug fixes

## Examples

### Feature (Multiple Packages - Separate Files Preferred)

When a feature spans multiple packages, create **separate changeset files** for cleaner CHANGELOG:

**File:** `.changeset/navigator-types.md`

```markdown
---
"@real-router/types": minor
---

Add `Navigator` interface for safe router subset (#37)

New `Navigator` interface providing minimal router API for UI components.
```

**File:** `.changeset/navigator-core.md`

```markdown
---
"@real-router/core": minor
---

Add `getNavigator()` method (#37)

New `Router.getNavigator()` method returns a frozen, cached `Navigator` instance.
```

**File:** `.changeset/navigator-react.md`

```markdown
---
"@real-router/react": minor
---

Add `useNavigator()` hook and update React bindings (#37)

**BREAKING CHANGE:** `useRoute()` now returns `{ navigator, ... }` instead of `{ router, ... }`.
```

**Why separate files?**

- Each package gets its own CHANGELOG entry with relevant details
- Breaking changes only appear in affected package's CHANGELOG
- Easier to track which package introduced which feature

### Bug Fix (Single Package)

**File:** `.changeset/middleware-unsubscribe-fix.md`

```markdown
---
"@real-router/core": patch
---

Make middleware unsubscribe function idempotent (#XX)

Calling unsubscribe multiple times no longer throws an error.
```

### Performance (Single Package)

**File:** `.changeset/useplugin-perf.md`

```markdown
---
"@real-router/core": patch
---

Optimize `usePlugin()` for single-plugin calls (#XX)

Skip array/Set allocation when registering a single plugin.
```

### Breaking Change (Pre-1.0)

**File:** `.changeset/remove-deprecated-api.md`

```markdown
---
"@real-router/core": minor
---

Remove deprecated `forward()` method (#XX)

**Breaking Change:** The `forward()` method has been removed.

**Migration:**
\`\`\`diff

- router.forward('route.name', { id: '123' });

* // Use forwardTo option in route config instead
* const routes = [
* { name: 'old', path: '/old', forwardTo: 'new' }
* ];
  \`\`\`
```

## Common Mistakes

### ❌ Mixing Multiple Changes

```markdown
---
"@real-router/core": minor
---

Add noValidate option and fix middleware bug
```

**Problem:** Two unrelated changes in one changeset.

**Solution:** Create two separate changesets:

- `novalidate-feature.md`
- `middleware-fix.md`

### ❌ Including Private Packages

```markdown
---
"route-tree": patch
---

Move validation to core
```

**Problem:** `route-tree` is private (`"private": true`).

**Solution:** Don't create changesets for private packages. Instead, create a changeset for the **public consumer** whose behavior changed (e.g., `@real-router/core` depends on `route-tree` via `workspace:^`). The user-facing behavior changed in core, not in the internal package.

### ❌ Wrong Version Bump

```markdown
---
"@real-router/core": patch
---

Add new `noValidate` option
```

**Problem:** New feature should be `minor`, not `patch`.

**Solution:** Use `minor` for new features.

### ❌ Missing Package Quotes

```markdown
---
@real-router/core: minor
---
```

**Problem:** Package name must be quoted.

**Solution:** Use `"@real-router/core": minor`

## Workflow

1. **Make changes** to source code
2. **Create changeset** describing the change
3. **Commit both** source changes and changeset file
4. **CI validates** that changeset exists (required for source changes)
5. **On merge to master**, changesets bot creates version PR
6. **Merge version PR** to publish packages

## Validation

Changeset rules are enforced in two complementary places:

**Pre-push — content validity** (`pnpm lint:changeset`, `.changeset/check-changeset.mjs`):
runs first in the pre-push hook (fast fail-fast). Validates every pending
`.changeset/*.md` that is present — **no files → no-op**, so a WIP or infra-only
push is never blocked. What it checks:

```
- Frontmatter is present and well-formed (--- … ---)
- Package names are quoted and match a real workspace package
- Bump level is major | minor | patch (pre-1.0 packages reject major)
- The package is public (not "private": true)
- Exactly one package per file
- A PR/issue reference (#NN) appears in the description
```

> Not machine-checked (semantic): "one logical change per file", "don't mix
> features/fixes", "right bump for the change type". Those are on the author.

**CI — changeset presence** (`.github/workflows/changeset-check.yml`, blocks PR merge):

```yaml
- If public-package source files changed → a changeset is REQUIRED
```

Any change to a public package's source (or shared `*.ts` shipped source) needs a changeset — including comment/JSDoc-only edits. For a no-behaviour-change edit, add a `patch` changeset (`pnpm changeset`); JSDoc on an exported symbol ships in the `.d.ts`, so a patch release is legitimate.

## Additional Resources

- [Changesets Documentation](https://github.com/changesets/changesets)
- [Common Questions](https://github.com/changesets/changesets/blob/main/docs/common-questions.md)
- [Project Guidelines](../CLAUDE.md#changesets)
