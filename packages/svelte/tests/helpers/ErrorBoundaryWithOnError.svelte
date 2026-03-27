<script lang="ts">
  import RouterErrorBoundary from "../../src/components/RouterErrorBoundary.svelte";
  import TestRouterProvider from "./TestRouterProvider.svelte";

  import type { Router, RouterError, State } from "@real-router/core";

  let {
    router,
    onError,
  }: {
    router: Router;
    onError: (
      error: RouterError,
      toRoute: State | null,
      fromRoute: State | null,
    ) => void;
  } = $props();
</script>

<TestRouterProvider {router}>
  <RouterErrorBoundary {onError}>
    {#snippet children()}
      <div data-testid="children">App Content</div>
    {/snippet}
    {#snippet fallback(error: RouterError)}
      <div data-testid="fallback">{error.code}</div>
    {/snippet}
  </RouterErrorBoundary>
</TestRouterProvider>
