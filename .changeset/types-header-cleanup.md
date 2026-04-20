---
"@real-router/types": patch
---

Remove stale file-path header comments from `src/*.ts` (#490)

Each `src/*.ts` file carried a `// packages/core-types/modules/<name>.ts`
comment whose path no longer exists (the directory was renamed to `src/`).
These comments added no value beyond what the editor already shows, so
they have been removed. No behavior or API change.
