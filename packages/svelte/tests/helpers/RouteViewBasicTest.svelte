<script lang="ts">
  import RouteView from "../../src/components/RouteView.svelte";
  import TestRouterProvider from "./TestRouterProvider.svelte";

  import type { Router } from "@real-router/core";

  let { router }: { router: Router } = $props();
</script>

<TestRouterProvider {router}>
  <RouteView nodeName="">
    {#snippet test()}
      <div data-testid="test">Test Page</div>
    {/snippet}
    {#snippet home()}
      <div data-testid="home">Home Page</div>
    {/snippet}
    {#snippet users()}
      <div data-testid="users">Users Page</div>
    {/snippet}
    {#snippet about()}
      <div data-testid="about">About Page</div>
    {/snippet}
    {#snippet notFound()}
      <div data-testid="not-found">Not Found</div>
    {/snippet}
  </RouteView>
</TestRouterProvider>
