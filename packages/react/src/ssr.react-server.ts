// SSR-feature entry — type-only re-exports under `react-server` condition.
//
// Server Components that consume `<ClientOnly>`/`<ServerOnly>`/`<Await>`/
// `<Streamed>` props (e.g. for typing wrapper components rendered server-side)
// import the prop types from `@real-router/react/ssr`. Under the
// `react-server` condition this entry resolves to types only — no client
// runtime is pulled into the Server Component bundle.

export type { ClientOnlyProps } from "./components/ClientOnly";

export type { ServerOnlyProps } from "./components/ServerOnly";

export type { AwaitProps } from "./components/Await";

export type { StreamedProps } from "./components/Streamed";
