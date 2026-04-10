---
"@real-router/lifecycle-plugin": minor
---

Add `@real-router/source` export condition for monorepo-internal src resolution (#431)

A new scoped export condition `@real-router/source` is added to the package exports. Monorepo-internal TypeScript checking (via `tsconfig.json` `customConditions`) and Vitest (via the `workspaceSourceAliases` helper) now resolve `@real-router/*` imports to their `src/*.ts` files directly — no `dist/` artifacts required.

External consumers (Vite, Webpack, Node.js) don't recognize this scoped condition name, so they continue to resolve via `import` / `require` → `dist/` exactly as before. The `@real-router/source` entry is invisible to non-monorepo tools and doesn't change published package behavior.

This structurally eliminates the race condition that caused flaky CI type-checks (#431) and makes the monorepo resilient to incomplete `.d.ts` generation from tsdown + rolldown RC (#425).
