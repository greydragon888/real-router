// SSR-feature entry — Angular 21+
//
// Server-side and SSR-aware components/functions. Mirrors the
// `/ssr` subpath split shipped by every other adapter (#604 + #610).
// Trigger reached: `<ClientOnly>`, `<ServerOnly>`, `injectDeferred()`
// — three SSR-feature exports, ≥3 threshold per
// `.claude/SSR_FEATURE_GAPS_RU.md` §8.
//
// Asymmetric Angular note: Angular has no native `<Suspense>` /
// `use(promise)` analogue, so this entry exposes the signal-based
// `injectDeferred()` instead of `<Await>` / `<Streamed>` adapter
// components. Consumers compose with `@if (signal()) { … } @else { … }`,
// the `async` pipe (`from(deferredPromise)`), or native `@defer`
// blocks for chunk-level lazy hydration.

// Components
export { ClientOnly } from "./components/ClientOnly";

export { ServerOnly } from "./components/ServerOnly";

// Functions
export { injectDeferred } from "./functions/injectDeferred";
