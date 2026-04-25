<script lang="ts" module>
  import { startsWithSegment } from "@real-router/route-utils";

  // Snippet names reserved by RouteView for non-segment slots. Iteration in
  // `getActiveSegment` skips these so they don't accidentally match a route.
  const RESERVED_SLOT_NAMES = new Set(["self", "notFound"]);

  export function getActiveSegment(
    routeName: string,
    node: string,
    snippets: Record<string, unknown>,
  ): string {
    const prefix = node ? `${node}.` : "";

    for (const segment in snippets) {
      if (RESERVED_SLOT_NAMES.has(segment)) continue;
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
    self,
    notFound,
    ...segmentSnippets
  }: {
    nodeName: string;
    self?: Snippet;
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
  {:else if self && route.name === nodeName}
    {@render self()}
  {:else if route.name === UNKNOWN_ROUTE && notFound}
    {@render notFound()}
  {/if}
{/if}
