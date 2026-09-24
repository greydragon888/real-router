<script lang="ts">
  import ServerOnly from "../../src/components/ServerOnly.svelte";
</script>

<ServerOnly>
  <span data-testid="children">server content</span>
  {#snippet fallback()}
    <span data-testid="fallback">client view</span>
  {/snippet}
</ServerOnly>
