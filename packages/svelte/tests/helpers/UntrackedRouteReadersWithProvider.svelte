<script lang="ts">
  import TestRouterProvider from "./TestRouterProvider.svelte";
  import UntrackedRouteReaders from "./UntrackedRouteReaders.svelte";

  import type { RouteContext } from "../../src/types";
  import type { Router } from "@real-router/core";

  let {
    router,
    nodeName,
    onCapture,
  }: {
    router: Router;
    nodeName: string;
    onCapture: (readers: { route: RouteContext; node: RouteContext }) => void;
  } = $props();
</script>

<TestRouterProvider {router}>
  <UntrackedRouteReaders {nodeName} {onCapture} />
</TestRouterProvider>
