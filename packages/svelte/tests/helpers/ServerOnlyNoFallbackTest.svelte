<script lang="ts">
  import ServerOnly from "../../src/components/ServerOnly.svelte";
</script>

<ServerOnly>
  <span data-testid="children">server content</span>
</ServerOnly>
