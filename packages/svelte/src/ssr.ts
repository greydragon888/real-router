// SSR-feature entry — Svelte 5+
//
// Server-side and SSR-aware components/composables. Mirror of `@real-router/react/ssr`
// — same exports, Svelte-native idioms (`{#await}` block under the hood,
// `$state` rune for ClientOnly/ServerOnly, useDeferred returns Promise<T>
// for direct use with native `{#await}`).

// Components
export { default as ClientOnly } from "./components/ClientOnly.svelte";

export { default as ServerOnly } from "./components/ServerOnly.svelte";

export { default as Await } from "./components/Await.svelte";

export { default as Streamed } from "./components/Streamed.svelte";

// Composables
export { useDeferred } from "./composables/useDeferred.svelte";
