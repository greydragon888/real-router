// SSR-feature entry — Preact 10+
//
// Server-side and SSR-aware components/hooks. Mirror of `@real-router/react/ssr`
// — same exports, same API surface. Pair with `@real-router/ssr-data-plugin`'s
// `defer()` helper and `injectDeferredScripts` server-side wire-format.

// Components
export { ClientOnly } from "./components/ClientOnly";

export { ServerOnly } from "./components/ServerOnly";

export { Await } from "./components/Await";

export { Streamed } from "./components/Streamed";

// Hooks
export { useDeferred } from "./hooks/useDeferred";

// Types
export type { ClientOnlyProps } from "./components/ClientOnly";

export type { ServerOnlyProps } from "./components/ServerOnly";

export type { AwaitProps } from "./components/Await";

export type { StreamedProps } from "./components/Streamed";
