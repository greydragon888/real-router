<script lang="ts">
  import RouterErrorBoundary from "../../src/components/RouterErrorBoundary.svelte";
  import TestRouterProvider from "./TestRouterProvider.svelte";

  import type { Router, RouterError } from "@real-router/core";

  let { router }: { router: Router } = $props();
</script>

<TestRouterProvider {router}>
  <RouterErrorBoundary>
    {#snippet children()}
      <div data-testid="children">App Content</div>
    {/snippet}
    {#snippet fallback(error: RouterError, resetError: () => void)}
      <div data-testid="fallback">{error.code}</div>
      <button data-testid="dismiss" onclick={resetError}>Dismiss</button>
    {/snippet}
  </RouterErrorBoundary>
</TestRouterProvider>
