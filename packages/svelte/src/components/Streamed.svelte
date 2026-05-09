<!--
  @component
  Cross-adapter alias for Svelte's `{#await}` boundary. Renders the `fallback`
  snippet while a `pending` Promise prop is unresolved, then `children` (with
  the resolved value) once it settles. Symmetric naming with the
  React/Preact/Solid/Vue/Angular `<Streamed>` components — pick `<Streamed>`
  for cross-framework consistency, or use `{#await}` directly when team
  conventions prefer that.

  Svelte 5 has **no progressive HTTP-flush** in SSR (one TCP frame, late-
  resolving promises ship in the final body) — the `{#await}` block on the
  client retains its native streaming-after-hydration semantics. See
  `examples/web/svelte/ssr-examples/ssr-streaming/README.md` for the
  end-to-end story.
-->
<script lang="ts" generics="T">
  import type { Snippet } from "svelte";

  interface Props {
    /** Promise to await — typically `useDeferred(key)`. */
    pending: Promise<T>;
    /** Render snippet for the resolved value. */
    children: Snippet<[T]>;
    /** Snippet shown while the promise is pending. */
    fallback?: Snippet;
  }

  let { pending, children, fallback }: Props = $props();
</script>

{#await pending}
  {#if fallback}
    {@render fallback()}
  {/if}
{:then value}
  {@render children(value)}
{/await}
