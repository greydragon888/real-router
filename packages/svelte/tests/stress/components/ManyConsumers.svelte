<script lang="ts">
  import StressConsumer from "./StressConsumer.svelte";

  let {
    count,
    prefix = "route",
    onRenders,
  }: {
    count: number;
    prefix?: string;
    onRenders?: (() => void)[];
  } = $props();

  const items = Array.from({ length: count }, (_, i) => ({
    nodeName: `${prefix}${i}`,
    key: i,
  }));
</script>

{#each items as item (item.key)}
  <StressConsumer nodeName={item.nodeName} onRender={onRenders?.[item.key]} />
{/each}
