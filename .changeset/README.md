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
- **Version bump** must be one of: `major`, `minor`, `patch` — which one, the table in [Version Bump Guidelines](#version-bump-guidelines) decides
- Exactly **one public** package per file

### Description

- **First line** = short title (appears in CHANGELOG as bullet point)
- **Body** = optional details, examples, migration guide
- Use markdown formatting (code blocks, lists, links)

## Version Bump Guidelines

This section is the only place the bump rule is written. `/changeset`, the
other skills and `CLAUDE.md` point here instead of restating it.

The bump follows [Semantic Versioning 2.0.0](https://semver.org/), with one
exception before 1.0: an incompatible change takes `minor`, not `major`.

| The change                                                    | Before 1.0 | From 1.0 |
| ------------------------------------------------------------- | ---------- | -------- |
| Incompatible change to the public API                         | `minor`    | `major`  |
| New functionality, backward compatible                        | `minor`    | `minor`  |
| Bug fix, performance or refactoring that keeps the public API | `patch`    | `patch`  |

The public API is what a package declares: its exported types and its
documented behavior. A bug fix fixes incorrect behavior, whatever result it
changes on the way; refusing earlier an input the declared API already rules
out is one. Changing documented behavior is an incompatible change, inside a bug
task too. An incompatible change says what the consumer changes — see the
Breaking Change example below. `pnpm lint:changeset` refuses a `patch` whose
description labels the change breaking.

## Examples

### Feature (Multiple Packages - Separate Files Preferred)

When a feature spans multiple packages, create **separate changeset files** for cleaner CHANGELOG:

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
"@real-router/shared-sources": patch
---

Fix popstate handling in browser-env
```

**Problem:** `@real-router/shared-sources` (`shared/`) is private (`"private": true`).

**Solution:** Don't create changesets for private packages. Instead, create a changeset for each **public consumer** whose behavior changed (e.g., `shared/browser-env/` is bundled into `@real-router/browser-plugin`, `@real-router/hash-plugin` and `@real-router/navigation-plugin` through their `src/browser-env` symlink). The user-facing behavior changed in those plugins, not in the internal package.

### ❌ Wrong Version Bump

```markdown
---
"@real-router/core": patch
---

Add new `noValidate` option
```

**Problem:** New feature should be `minor`, not `patch`.

**Solution:** Take the bump from the table in [Version Bump Guidelines](#version-bump-guidelines) — a new option is new functionality.

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
runs first among the pre-push checks, right after the push guard (fast
fail-fast). Validates every pending
`.changeset/*.md` that is present — **no files → no-op**, so a WIP or infra-only
push is never blocked. What it checks:

```
- Frontmatter is present and well-formed (--- … ---)
- Package names are quoted and match a real workspace package
- Bump level is major | minor | patch (pre-1.0 packages reject major)
- The package is public (not "private": true)
- Exactly one package per file
- A PR/issue reference (#NN) appears in the description
- A patch has no description line that opens with "Breaking"
```

> Not machine-checked (semantic): "one logical change per file", "don't mix
> features/fixes", "right bump for the change type" beyond that one label.
> Those are on the author.

**CI — changeset presence** (`.github/workflows/changeset-check.yml`, blocks PR merge):

```yaml
- If public-package source files changed → a changeset is REQUIRED
```

A change to a public package's code (`packages/*/src/`, or shared `*.ts` shipped source) needs a changeset. A comment-only or JSDoc-only edit, a doc inside `src/` and a diff that touches only tests do not: they go straight to `master` as infrastructure (the Rules of [CLAUDE.md](../CLAUDE.md)), the pre-push hook runs every check on them, and they ship with the package's next release. The pull-request gate above never sees them.

## Additional Resources

- [Changesets Documentation](https://github.com/changesets/changesets)
- [Common Questions](https://github.com/changesets/changesets/blob/main/docs/common-questions.md)
- [Project Guidelines](../CLAUDE.md#changesets)
