---
"@real-router/core": patch
---

Keep the standalone doors a top layer: `throwIfDisposed` moves out of `api/` (#2293)

Internal refactor, no behaviour change. `throwIfDisposed` — the refusal both the `api/` doors and the `RouterInternals` adapters make on a disposed router — moves from `src/api/helpers.ts` to `src/internals.ts`, so nothing outside `src/api/` imports from it. An `import-x/no-restricted-paths` zone in the package's ESLint config keeps it that way.
