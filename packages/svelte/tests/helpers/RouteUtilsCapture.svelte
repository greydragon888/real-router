<script lang="ts">
  import { useRouteUtils } from "../../src/composables/useRouteUtils.svelte";

  let { onCapture }: { onCapture: (result: unknown) => void } = $props();

  onCapture(useRouteUtils());
</script>

<div></div>
