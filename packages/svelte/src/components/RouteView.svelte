<script lang="ts" module>
  import { startsWithSegment } from "@real-router/route-utils";

  export function getActiveSegment(
    routeName: string,
    node: string,
    snippets: Record<string, unknown>,
  ): string {
    const prefix = node ? `${node}.` : "";

    for (const segment in snippets) {
      if (segment === "notFound") continue;
      if (startsWithSegment(routeName, prefix + segment)) {
        return segment;
      }
    }

    return "";
  }
</script>

<script lang="ts">
  import { UNKNOWN_ROUTE } from "@real-router/core";

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
</script>

{#if routeContext.route.current}
  {@const route = routeContext.route.current}
  {@const segment = getActiveSegment(route.name, nodeName, segmentSnippets)}
  {#if segment}
    {@const snippet = segmentSnippets[segment] as Snippet}
    {@render snippet()}
  {:else if route.name === UNKNOWN_ROUTE && notFound}
    {@render notFound()}
  {/if}
{/if}
