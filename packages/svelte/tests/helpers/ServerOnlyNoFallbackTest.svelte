<script lang="ts">
  import ServerOnly from "../../src/components/ServerOnly.svelte";
</script>

<ServerOnly>
  {#snippet children()}
    <span data-testid="children">server content</span>
  {/snippet}
</ServerOnly>
