<script lang="ts">
  import { UNKNOWN_ROUTE } from "@real-router/core";
  import { startsWithSegment } from "@real-router/route-utils";

  import { useRouteNode } from "../composables/useRouteNode.svelte";

  import type { Snippet } from "svelte";

  let {
    nodeName,
    notFound,
    ...segmentSnippets
  }: {
    nodeName: string;
    notFound?: Snippet;
    [key: string]: Snippet | string | undefined;
  } = $props();

  const routeContext = useRouteNode(nodeName);

  function getActiveSegment(
    routeName: string,
    node: string,
    snippets: Record<string, unknown>,
  ): string {
    for (const segment of Object.keys(snippets)) {
      const fullSegmentName = node ? `${node}.${segment}` : segment;

      if (startsWithSegment(routeName, fullSegmentName)) {
        return segment;
      }
    }

    return "";
  }
</script>

{#if routeContext.route.current}
  {@const route = routeContext.route.current}
  {@const segment = getActiveSegment(route.name, nodeName, segmentSnippets)}
  {#if segment && segmentSnippets[segment]}
    {@render (segmentSnippets[segment] as Snippet)()}
  {:else if route.name === UNKNOWN_ROUTE && notFound}
    {@render notFound()}
  {/if}
{/if}
