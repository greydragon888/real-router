<script lang="ts">
  import RouterErrorBoundary from "../../../src/components/RouterErrorBoundary.svelte";
</script>

<RouterErrorBoundary onError={() => {}}>
  <div>child</div>
  {#snippet fallback(_error, _r)}
    <div>err</div>
  {/snippet}
</RouterErrorBoundary>
