# Changesets

This folder contains changeset files that describe changes to be included in the next release.

## Quick Start

```bash
# Create a new changeset interactively
pnpm changeset

# Or create manually: .changeset/descriptive-name.md
```

## Principles

- **One file per logical change** — each changeset describes one feature, fix, or refactor
- **Separate by type** — don't mix features, fixes, and performance improvements in one changeset
- **Public packages only** — skip private packages (`"private": true` in package.json)
- **Multi-package changesets** — same description will be copied to ALL listed packages in CHANGELOG

## File Naming Convention

Use descriptive kebab-case names that reflect the change:

| Pattern                      | Example                         | Use Case                |
| ---------------------------- | ------------------------------- | ----------------------- |
| `{feature-name}-feature.md`  | `novalidate-feature.md`         | New feature             |
| `{area}-perf.md`             | `useplugin-perf.md`             | Performance improvement |
| `{component}-{issue}-fix.md` | `middleware-unsubscribe-fix.md` | Bug fix                 |
| `{area}-refactor.md`         | `validation-refactor.md`        | Internal refactoring    |

## File Format

```markdown
---
"@real-router/core": minor
"@real-router/types": minor
---

Short title describing the change

Optional detailed description with:

- Context about why the change was made
- Code examples showing usage
- Migration notes for breaking changes
```

### Frontmatter (YAML)

- **Package names** must match exactly (with quotes)
- **Version bump** must be one of: `major`, `minor`, `patch`
- List all affected **public** packages

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

### Feature (Multiple Packages)

**File:** `.changeset/novalidate-feature.md`

```markdown
---
"@real-router/core": minor
"@real-router/types": minor
---

Add `noValidate` option to disable validation in production

New configuration option for performance-critical environments:

\`\`\`typescript
const router = createRouter(routes, {
noValidate: process.env.NODE_ENV === 'production'
});
\`\`\`

When enabled, skips ~40 validation calls per navigation cycle.
Constructor always validates options object itself.
```

**Why multiple packages?**

- `@real-router/core` — implements the feature
- `@real-router/types` — adds the type definition

### Bug Fix (Single Package)

**File:** `.changeset/middleware-unsubscribe-fix.md`

```markdown
---
"@real-router/core": patch
---

Make middleware unsubscribe function idempotent

Calling unsubscribe multiple times no longer throws an error.
```

### Performance (Single Package)

**File:** `.changeset/useplugin-perf.md`

```markdown
---
"@real-router/core": patch
---

Optimize `usePlugin()` for single-plugin calls

Skip array/Set allocation when registering a single plugin.
```

### Breaking Change (Pre-1.0)

**File:** `.changeset/remove-deprecated-api.md`

```markdown
---
"@real-router/core": minor
---

Remove deprecated `forward()` method

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

**Solution:** Don't create changesets for private packages.

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

## CI Integration

Our CI enforces changeset presence:

```yaml
# .github/workflows/changeset-check.yml
- If source files changed → changeset REQUIRED (blocks merge)
- If changeset exists → must include PR reference (#XX)
```

**Escape hatch:** Add `#trivial` to PR title to skip changeset requirement.

## Additional Resources

- [Changesets Documentation](https://github.com/changesets/changesets)
- [Common Questions](https://github.com/changesets/changesets/blob/main/docs/common-questions.md)
- [Project Guidelines](../CLAUDE.md#changesets)
