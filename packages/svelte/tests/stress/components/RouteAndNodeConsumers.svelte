<script lang="ts">
  import StressRouteConsumer from "./StressRouteConsumer.svelte";
  import StressConsumer from "./StressConsumer.svelte";

  let {
    routeCount,
    nodeCount,
    onRouteRender,
    onNodeRender,
  }: {
    routeCount: number;
    nodeCount: number;
    onRouteRender?: (() => void) | undefined;
    onNodeRender?: (() => void) | undefined;
  } = $props();

  const routeItems = Array.from({ length: routeCount }, (_, i) => i);
  const nodeItems = Array.from({ length: nodeCount }, (_, i) => i);
</script>

{#each routeItems as key (key)}
  <StressRouteConsumer onRender={onRouteRender} />
{/each}
{#each nodeItems as key (key)}
  <StressConsumer nodeName="" onRender={onNodeRender} />
{/each}
