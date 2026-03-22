<script lang="ts">
  import { useRouteNode } from "../../../src/composables/useRouteNode.svelte";

  let { nodeName, onRender }: { nodeName: string; onRender?: () => void } = $props();

  const { route } = useRouteNode(nodeName);

  $effect(() => {
    // Access .current in reactive context to register subscription
    route.current;
    onRender?.();
  });
</script>

<div data-testid={nodeName}>{route.current?.name ?? "none"}</div>
