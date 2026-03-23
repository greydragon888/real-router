<script lang="ts">
  import StressLinkAction from "./StressLinkAction.svelte";

  let {
    count,
    prefix = "route",
  }: {
    count: number;
    prefix?: string;
  } = $props();

  const items = Array.from({ length: count }, (_, i) => ({
    routeName: `${prefix}${i}`,
    testId: `action-${i}`,
    key: i,
  }));
</script>

{#each items as item (item.key)}
  <StressLinkAction routeName={item.routeName} testId={item.testId} />
{/each}
