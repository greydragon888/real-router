<script lang="ts">
  import { RouteView } from "@real-router/svelte";

  import ItemsSubscriber from "./ItemsSubscriber.svelte";

  const indices = [0, 1, 2, 3, 4];
</script>

{#each indices as i (i)}
  <ItemsSubscriber index={i} />
{/each}
<RouteView nodeName="items">
  {#snippet details()}
    <p>details</p>
  {/snippet}
</RouteView>
