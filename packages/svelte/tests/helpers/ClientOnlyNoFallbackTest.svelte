<script lang="ts">
  import ClientOnly from "../../src/components/ClientOnly.svelte";
</script>

<ClientOnly>
  {#snippet children()}
    <span data-testid="children">client content</span>
  {/snippet}
</ClientOnly>
