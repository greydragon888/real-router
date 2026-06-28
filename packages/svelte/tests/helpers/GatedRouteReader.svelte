<script lang="ts">
  import RouteCapture from "./RouteCapture.svelte";
  import RouterProvider from "../../src/RouterProvider.svelte";

  import type { RouteContext } from "../../src/types";
  import type { Router } from "@real-router/core";

  // #778 P1 fixture: a `route.current` reader (RouteCapture) gated behind a
  // plain `{#if show}` under the REAL RouterProvider (so the lazy
  // createReactiveSource bridge drives the subscription, unlike the eager
  // renderWithRouter helper). When `show` flips off, the ONLY `.current` reader
  // unmounts → createSubscriber unsubscribes → createRouteSource disconnects.
  let { router, show }: { router: Router; show: boolean } = $props();

  const noop = (_ctx: RouteContext): void => {};
</script>

<RouterProvider {router}>
  {#if show}
    <RouteCapture onCapture={noop} />
  {:else}
    <div data-testid="off">off</div>
  {/if}
</RouterProvider>
