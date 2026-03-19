<script lang="ts">
  import { useNavigator } from "../../src/composables/useNavigator.svelte";

  let { onCapture }: { onCapture: (result: unknown) => void } = $props();

  onCapture(useNavigator());
</script>

<div></div>
