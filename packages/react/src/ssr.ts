// SSR-feature entry — React 19.2+
//
// Server-side and SSR-aware client components/hooks. Importing from this
// subpath instead of the main entry signals "this code path is part of
// the SSR pipeline" and makes server-only types stay out of the client
// TypeScript context for app code that doesn't touch SSR.
//
// Trigger for the split: ≥3 SSR-feature exports (#604 + #610 = 5 exports).
// See `.claude/SSR_FEATURE_GAPS_RU.md` §8 for the architectural rationale.

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
