<script lang="ts">
  import ClientOnly from "../../src/components/ClientOnly.svelte";
</script>

<ClientOnly>
  <span data-testid="children">client content</span>
  {#snippet fallback()}
    <span data-testid="fallback">loading</span>
  {/snippet}
</ClientOnly>
