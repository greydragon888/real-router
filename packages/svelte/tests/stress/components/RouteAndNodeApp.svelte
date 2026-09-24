<script lang="ts">
  import RouteAndNodeConsumers from "./RouteAndNodeConsumers.svelte";
  import RouterProvider from "../../../src/RouterProvider.svelte";

  import type { Router } from "@real-router/core";

  let {
    router,
    routeCount,
    nodeCount,
    onRouteRender,
    onNodeRender,
  }: {
    router: Router;
    routeCount: number;
    nodeCount: number;
    onRouteRender?: (() => void) | undefined;
    onNodeRender?: (() => void) | undefined;
  } = $props();
</script>

<RouterProvider {router}>
  <RouteAndNodeConsumers
    {routeCount}
    {nodeCount}
    {onRouteRender}
    {onNodeRender}
  />
</RouterProvider>
