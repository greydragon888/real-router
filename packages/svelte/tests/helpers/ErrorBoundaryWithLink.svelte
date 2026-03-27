<script lang="ts">
  import Link from "../../src/components/Link.svelte";
  import RouterErrorBoundary from "../../src/components/RouterErrorBoundary.svelte";
  import TestRouterProvider from "./TestRouterProvider.svelte";

  import type { Router, RouterError } from "@real-router/core";

  let { router }: { router: Router } = $props();
</script>

<TestRouterProvider {router}>
  <RouterErrorBoundary>
    {#snippet children()}
      <Link routeName="dashboard" data-testid="link-dashboard">Dashboard</Link>
      <Link routeName="settings" data-testid="link-settings">Settings</Link>
    {/snippet}
    {#snippet fallback(error: RouterError)}
      <div data-testid="fallback">{error.code}</div>
    {/snippet}
  </RouterErrorBoundary>
</TestRouterProvider>
