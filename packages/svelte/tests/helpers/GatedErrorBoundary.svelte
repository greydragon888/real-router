<script lang="ts">
  import RouterErrorBoundary from "../../src/components/RouterErrorBoundary.svelte";
  import TestRouterProvider from "./TestRouterProvider.svelte";

  import type { Router, RouterError } from "@real-router/core";

  // #778 P2 fixture: the RouterErrorBoundary mounts only when `show` is true, so
  // a test can trigger a navigation error BEFORE the boundary exists and then
  // mount it. TestRouterProvider wraps the REAL RouterProvider (which eagerly
  // creates the error source), so the error is captured from Provider mount.
  let { router, show }: { router: Router; show: boolean } = $props();
</script>

<TestRouterProvider {router}>
  {#if show}
    <RouterErrorBoundary>
      {#snippet children()}
        <div>app</div>
      {/snippet}
      {#snippet fallback(error: RouterError)}
        <div data-testid="fb">{error.code}</div>
      {/snippet}
    </RouterErrorBoundary>
  {:else}
    <div>app</div>
  {/if}
</TestRouterProvider>
