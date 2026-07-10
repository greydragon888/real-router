<script lang="ts">
  import RouteView from "../../src/components/RouteView.svelte";
  import RouteViewSubtreeProbe from "./RouteViewSubtreeProbe.svelte";
  import TestRouterProvider from "./TestRouterProvider.svelte";

  import type { Router } from "@real-router/core";

  let {
    router,
    probe,
  }: { router: Router; probe: { mounts: number; destroys: number } } = $props();
</script>

<TestRouterProvider {router}>
  <RouteView nodeName="">
    {#snippet users()}
      <RouteViewSubtreeProbe {probe} />
    {/snippet}
    {#snippet about()}
      <div data-testid="about">About Page</div>
    {/snippet}
  </RouteView>
</TestRouterProvider>
