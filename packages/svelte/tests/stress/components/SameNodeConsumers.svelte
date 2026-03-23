<script lang="ts">
  import StressConsumer from "./StressConsumer.svelte";

  let {
    count,
    nodeName,
    onRenders,
  }: {
    count: number;
    nodeName: string;
    onRenders?: (() => void)[];
  } = $props();

  const items = Array.from({ length: count }, (_, i) => i);
</script>

{#each items as key (key)}
  <StressConsumer {nodeName} onRender={onRenders?.[key]} />
{/each}
