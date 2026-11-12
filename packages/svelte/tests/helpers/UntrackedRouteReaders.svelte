<script lang="ts">
  import { useRoute } from "../../src/composables/useRoute.svelte";
  import { useRouteNode } from "../../src/composables/useRouteNode.svelte";

  import type { RouteContext } from "../../src/types";

  // #2909 fixture: hands the readers out without reading them in the template,
  // so no reactive context subscribes their sources.
  let {
    nodeName,
    onCapture,
  }: {
    nodeName: string;
    onCapture: (readers: { route: RouteContext; node: RouteContext }) => void;
  } = $props();

  onCapture({ route: useRoute(), node: useRouteNode(nodeName) });
</script>

<div data-testid="readers">readers</div>
