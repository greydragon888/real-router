<script lang="ts">
  import { useDeferred } from "../../src/composables/useDeferred.svelte";

  interface Props {
    keyName: string;
    onCapture: (promise: Promise<unknown>) => void;
  }

  let { keyName, onCapture }: Props = $props();

  // Capture the result via $effect so the closure observes a fresh
  // `useDeferred(...)` call after every component mount.
  $effect(() => {
    onCapture(useDeferred(keyName));
  });
</script>
