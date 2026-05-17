---
"@real-router/solid": minor
---

Audit follow-up — RouterContextValue export, perf, refactor, tests

Closes the 26-item action plan from `packages/solid/.claude/review-2026-05-16.md`.

**Public API:**

- Export `RouterContextValue` type from main entry — README previously
  referenced it in the Contexts table but it was not importable.

**Performance:**

- `createStoreFromSource`: identity guard short-circuits `reconcile` when
  the source emits the same snapshot reference (cached lazy sources
  benefit per navigation × N store consumers).
- `Link`: extract `hashOpts` into a separate `createMemo` — `{ hash }`
  literal allocated only when `local.hash` changes, not on every `href`
  memo evaluation.

**Refactor (no behaviour change):**

- `RouteView`: replace IIFE-in-JSX with idiomatic `<Show>` + `<For>` over
  a `createMemo<JSX.Element[]>(renderList)`. `<For>` reuses DOM nodes
  between route changes on large RouteView subtrees.
- Consolidate `useContext(RouterContext) + null-check + throw` across 4
  call sites into a single `useRequiredRouterContext(consumerName)`
  helper.
- Extract `createMountedSignal()` helper used by `ClientOnly` /
  `ServerOnly` boundary components.

**Tests (337 functional + 139 PBT + 95 stress = 571 tests, +82 new):**

- Property tests: new `shouldNavigate.properties.ts` and
  `applyLinkA11y.properties.ts` files; added invariants for
  transitivity, anti-symmetry, monotonicity, cross-function consistency,
  homomorphism, first-Match-wins, BigInt edges, cyclic objects, hostile
  keys, long-string length stress, hash idempotency, query+hash combo,
  relative paths, and more across existing files. Total PBT: 72 → 139.
- Stress tests: 5 new top-MEDIUM scenarios — `multiple-providers`
  (G18), `route-enter-exit` E2 remount race (G12), scroll-restore
  pagehide leak window (G4), Link hash dynamic cache growth (G6),
  concurrent Promise.all navigation (G16). Total stress: 86 → 95.
- Functional: hardened assertions across 14 test files (no-op `?? {}`
  removal, explicit `errorCodes.CANNOT_ACTIVATE` checks, `expectTypeOf`
  for `useRoute<P>` generic, source-caching N→1 subscription tests, etc.).

**Documentation:**

- `INVARIANTS.md` synced with all 139 PBT: 4 new sections
  (`collectElements`, `buildRenderList`, `shouldNavigate`,
  `applyLinkA11y`) plus expanded existing sections.
- `README.md`: corrected examples count (17 → 20), added `ssr-mixed`,
  documented `useRoute<P>` generic, `<HttpStatusCode />` usage,
  Streaming SSR caveat, `useRoute()` throw behaviour.
- `ARCHITECTURE.md`: updated stress-test file count (46/13 → 30),
  clarified `@real-router/route-utils` description.
