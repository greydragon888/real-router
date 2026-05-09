<script lang="ts">
  import Await from "../../src/components/Await.svelte";
</script>

<Await name="count">
  {#snippet children(value: unknown)}
    <span data-testid="value">value={String(value)}</span>
  {/snippet}
</Await>
