<script lang="ts">
  import RouterProvider from "../../src/RouterProvider.svelte";

  import type { Router } from "@real-router/core";

  let {
    router,
    viewTransitions,
  }: {
    router: Router;
    viewTransitions?: boolean;
  } = $props();
</script>

{#if viewTransitions !== undefined}
  <RouterProvider {router} {viewTransitions}>
    <div data-testid="child"></div>
  </RouterProvider>
{:else}
  <RouterProvider {router}>
    <div data-testid="child"></div>
  </RouterProvider>
{/if}
