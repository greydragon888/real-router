<script lang="ts">
  import { useRouteNode } from "../../../src/composables/useRouteNode.svelte";

  let { count }: { count: number } = $props();

  const nodes = Array.from({ length: count }, () => useRouteNode("users"));
</script>

{#each nodes as node, i (i)}
  <span>{node.route.current?.name ?? "n"}</span>
{/each}
