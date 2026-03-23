<script lang="ts">
  import { useRouter } from "../../src/composables/useRouter.svelte";

  let { onCapture }: { onCapture: (result: unknown) => void } = $props();

  onCapture(useRouter());
</script>

<div></div>
