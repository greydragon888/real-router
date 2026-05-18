// SSR-feature entry — Vue 3.3+
//
// Server-side and SSR-aware components/composables. Mirror of `@real-router/react/ssr`
// — same exports, Vue-native idioms (defineComponent + h(), async setup()
// for Await, native Suspense for Streamed).

// Components
export { ClientOnly } from "./components/ClientOnly";

export { ServerOnly } from "./components/ServerOnly";

export { Await } from "./components/Await";

export { Streamed } from "./components/Streamed";

export { HttpStatusCode } from "./components/HttpStatusCode";

export { HttpStatusProvider } from "./components/HttpStatusProvider";

// Composables
export { useDeferred } from "./composables/useDeferred";

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
