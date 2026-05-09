// SSR-feature entry for the legacy (React 18+) entry point.
//
// `<Await>` is excluded — it depends on React 19's `use(promise)` which is
// not available in React 18. React 18 consumers can compose the same
// pattern manually with `<Suspense>` + a Suspense-aware data library.

// Components
export { ClientOnly } from "./components/ClientOnly";

export { ServerOnly } from "./components/ServerOnly";

export { Streamed } from "./components/Streamed";

// Hooks
export { useDeferred } from "./hooks/useDeferred";

// Types
export type { ClientOnlyProps } from "./components/ClientOnly";

export type { ServerOnlyProps } from "./components/ServerOnly";

export type { StreamedProps } from "./components/Streamed";
