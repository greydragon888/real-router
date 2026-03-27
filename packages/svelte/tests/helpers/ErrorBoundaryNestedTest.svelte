<script lang="ts">
  import RouterErrorBoundary from "../../src/components/RouterErrorBoundary.svelte";
  import TestRouterProvider from "./TestRouterProvider.svelte";

  import type { Router, RouterError } from "@real-router/core";

  let { router }: { router: Router } = $props();
</script>

<TestRouterProvider {router}>
  <RouterErrorBoundary>
    {#snippet children()}
      <RouterErrorBoundary>
        {#snippet children()}
          <div data-testid="children">App Content</div>
        {/snippet}
        {#snippet fallback(error: RouterError)}
          <div data-testid="inner-fallback">{error.code}</div>
        {/snippet}
      </RouterErrorBoundary>
    {/snippet}
    {#snippet fallback(error: RouterError)}
      <div data-testid="outer-fallback">{error.code}</div>
    {/snippet}
  </RouterErrorBoundary>
</TestRouterProvider>
