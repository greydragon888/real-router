<script lang="ts">
  import RouteView from "../../src/components/RouteView.svelte";
  import TestRouterProvider from "./TestRouterProvider.svelte";

  import type { Router } from "@real-router/core";

  let { router }: { router: Router } = $props();
</script>

<TestRouterProvider {router}>
  <RouteView nodeName="">
    {#snippet home()}
      <div data-testid="home">Home Page</div>
    {/snippet}
  </RouteView>
</TestRouterProvider>
