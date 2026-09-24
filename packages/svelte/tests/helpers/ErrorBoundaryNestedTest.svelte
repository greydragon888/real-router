<script lang="ts">
  import TestRouterProvider from "./TestRouterProvider.svelte";
  import RouterErrorBoundary from "../../src/components/RouterErrorBoundary.svelte";

  import type { Router, RouterError } from "@real-router/core";

  let { router }: { router: Router } = $props();
</script>

<TestRouterProvider {router}>
  <RouterErrorBoundary>
    <RouterErrorBoundary>
      <div data-testid="children">App Content</div>
      {#snippet fallback(error: RouterError)}
        <div data-testid="inner-fallback">{error.code}</div>
      {/snippet}
    </RouterErrorBoundary>
    {#snippet fallback(error: RouterError)}
      <div data-testid="outer-fallback">{error.code}</div>
    {/snippet}
  </RouterErrorBoundary>
</TestRouterProvider>
