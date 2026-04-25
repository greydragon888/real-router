<script lang="ts">
  import RouteView from "../../src/components/RouteView.svelte";
  import TestRouterProvider from "./TestRouterProvider.svelte";

  import type { Router } from "@real-router/core";

  let { router }: { router: Router } = $props();
</script>

<TestRouterProvider {router}>
  <RouteView nodeName="users">
    {#snippet self()}
      <div data-testid="users-self">UsersList</div>
    {/snippet}
    {#snippet view()}
      <div data-testid="users-view">User View</div>
    {/snippet}
  </RouteView>
</TestRouterProvider>
