<script lang="ts">
  import { useRouteNode } from "../../src/composables/useRouteNode.svelte";

  import type { RouteContext } from "../../src/types";

  let { nodeName, onCapture }: { nodeName: string; onCapture: (result: RouteContext) => void } = $props();

  const ctx = useRouteNode(nodeName);

  onCapture(ctx);
</script>

<div data-testid="route-name">{ctx.route.current?.name ?? "none"}</div>
<div data-testid="previous-route">{ctx.previousRoute.current?.name ?? "none"}</div>
