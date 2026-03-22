<script lang="ts">
  import StressLink from "./StressLink.svelte";

  let {
    count,
    prefix = "route",
  }: {
    count: number;
    prefix?: string;
  } = $props();

  const items = Array.from({ length: count }, (_, i) => ({
    routeName: `${prefix}${i}`,
    testId: `link-${i}`,
    key: i,
  }));
</script>

{#each items as item (item.key)}
  <StressLink routeName={item.routeName} testId={item.testId} />
{/each}
