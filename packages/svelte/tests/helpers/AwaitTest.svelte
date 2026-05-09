<script lang="ts">
  import Await from "../../src/components/Await.svelte";
</script>

<Await name="reviews">
  {#snippet children(reviews: string[])}
    <ul data-testid="list">
      {#each reviews as r (r)}
        <li>{r}</li>
      {/each}
    </ul>
  {/snippet}
  {#snippet fallback()}
    <span data-testid="fallback">loading</span>
  {/snippet}
</Await>
