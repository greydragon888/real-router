<script lang="ts">
  import { useRouter } from "../../src/composables/useRouter.svelte";

  let { onCapture }: { onCapture: (err: unknown) => void } = $props();

  $effect(() => {
    try {
      // Calling a composable inside $effect is illegal — getContext throws.
      useRouter();
      onCapture(null);
    } catch (err) {
      onCapture(err);
    }
  });
</script>
