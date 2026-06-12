<script lang="ts">
  import { UNKNOWN_ROUTE } from "@real-router/core";

  import { useRouteNode } from "../composables/useRouteNode.svelte";
  import { getActiveSegment } from "./RouteView.helpers";

  import type { Snippet } from "svelte";

  let {
    nodeName,
    self,
    notFound,
    ...segmentSnippets
  }: {
    nodeName: string;
    self?: Snippet;
    notFound?: Snippet;
    [key: string]: Snippet | string | undefined;
  } = $props();

  // svelte-ignore state_referenced_locally
  // The node source is selected once for this mounted RouteView.
  const routeContext = useRouteNode(nodeName);
</script>

{#if routeContext.route.current}
  {@const route = routeContext.route.current}
  {@const segment = getActiveSegment(route.name, nodeName, segmentSnippets)}
  {#if segment}
    {@const snippet = segmentSnippets[segment] as Snippet}
    {@render snippet()}
  {:else if self && route.name === nodeName}
    {@render self()}
  {:else if route.name === UNKNOWN_ROUTE && notFound}
    {@render notFound()}
  {/if}
{/if}
