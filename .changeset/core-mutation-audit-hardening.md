---
"@real-router/core": minor
---

Internal: dead-code removal and equivalent-mutant annotations from the core mutation audit (#925)

No public API or behaviour change. Removes internal dead code surfaced by mutation testing — the `reverseArray` helper, the dead `getLifecycleFactories` RouterInternals accessor (no production caller — clone rebuilds from definitions), and the unreachable `config === null`, `!state`, and `buildNameFromSegments` fallback guards (all replaced by gated non-null assertions where TypeScript needs the narrowing) — and annotates proven-equivalent mutants with `// Stryker disable`.
