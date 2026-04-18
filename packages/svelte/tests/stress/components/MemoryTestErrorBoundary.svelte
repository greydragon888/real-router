<script lang="ts">
  import RouterErrorBoundary from "../../../src/components/RouterErrorBoundary.svelte";
</script>

<RouterErrorBoundary onError={() => {}}>
  {#snippet children()}
    <div>child</div>
  {/snippet}
  {#snippet fallback(_e, _r)}
    <div>err</div>
  {/snippet}
</RouterErrorBoundary>
