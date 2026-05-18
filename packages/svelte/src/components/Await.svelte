<!--
  @component
  Reads `useDeferred(name)` and renders the `children` snippet with the
  resolved value via Svelte's native `{#await}` block. Optional `fallback`
  snippet shown while the promise is pending; rejection bubbles to the
  nearest `{:catch}` handler in the surrounding `{#await}` chain (or
  `<Streamed>`).

  ```svelte
  <Await name="reviews">
    {#snippet children(reviews)}
      <ReviewList items={reviews} />
    {/snippet}
    {#snippet fallback()}
      <Spinner />
    {/snippet}
  </Await>
  ```
-->
<script lang="ts" generics="T">
  import { useDeferred } from "../composables/useDeferred.svelte";

  import type { Snippet } from "svelte";

  interface Props {
    /** Deferred key declared in the loader's `defer({ deferred: { <name>: ... } })`. */
    name: string;
    /** Render snippet for the resolved value. */
    children: Snippet<[T]>;
    /** Snippet shown while the promise is pending. */
    fallback?: Snippet;
  }

  let { name, children, fallback }: Props = $props();

  // `useDeferred(name)` reads `state.context.ssrDataDeferred[name]` —
  // wrap in `$derived` so a dynamic `name` prop re-resolves the promise
  // (vs. capturing the initial value at component init).
  const promise = $derived(useDeferred<T>(name));
</script>

{#await promise}
  {#if fallback}
    {@render fallback()}
  {/if}
{:then value}
  {@render children(value)}
{/await}
