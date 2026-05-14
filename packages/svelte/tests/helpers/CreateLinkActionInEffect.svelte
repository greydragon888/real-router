<script lang="ts">
  import { createLinkAction } from "../../src/actions/link.svelte";

  let { onCapture }: { onCapture: (action: unknown, err: unknown) => void } =
    $props();

  // Svelte 5 contract: `$effect` callbacks run within the component context
  // active at init, so `getContext` resolves the RouterProvider. Mirrors the
  // `UseRouterInEffect` helper for the `createLinkAction` factory. Locks the
  // behavior — a future Svelte refactor that broke effect-context inheritance
  // would surface here.
  $effect(() => {
    try {
      const action = createLinkAction();

      onCapture(action, null);
    } catch (err) {
      onCapture(null, err);
    }
  });
</script>
