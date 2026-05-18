// SSR-feature entry — Solid 1.7+
//
// Server-side and SSR-aware components/hooks. Mirror of `@real-router/react/ssr`
// — same exports, Solid-native idioms (Accessor returns, createResource-backed
// Await, native Suspense for Streamed).

// Components
export { ClientOnly } from "./components/ClientOnly";

export { ServerOnly } from "./components/ServerOnly";

export { Await } from "./components/Await";

export { Streamed } from "./components/Streamed";

export { HttpStatusCode } from "./components/HttpStatusCode";

export { HttpStatusProvider } from "./components/HttpStatusProvider";

// Hooks
export { useDeferred } from "./hooks/useDeferred";

// Utilities
export { createHttpStatusSink } from "./utils/createHttpStatusSink";

// Types
export type { ClientOnlyProps } from "./components/ClientOnly";

export type { ServerOnlyProps } from "./components/ServerOnly";

export type { AwaitProps } from "./components/Await";

export type { StreamedProps } from "./components/Streamed";

export type { HttpStatusCodeProps } from "./components/HttpStatusCode";

export type { HttpStatusProviderProps } from "./components/HttpStatusProvider";

export type { HttpStatusSink } from "./utils/createHttpStatusSink";
