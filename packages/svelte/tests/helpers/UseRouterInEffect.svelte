<script lang="ts">
  import { useRouter } from "../../src/composables/useRouter.svelte";

  let { onCapture }: { onCapture: (router: unknown, err: unknown) => void } =
    $props();

  // Svelte 5 contract: `$effect` callbacks run within the same component
  // context that was active at init, so `getContext` still resolves the
  // RouterProvider. Locks this behaviour — preact has a different rule, and
  // future Svelte changes that broke `$effect` context inheritance would
  // surface here.
  $effect(() => {
    try {
      const router = useRouter();

      onCapture(router, null);
    } catch (err) {
      onCapture(null, err);
    }
  });
</script>
