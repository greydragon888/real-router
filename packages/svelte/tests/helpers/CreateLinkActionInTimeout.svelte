<script lang="ts">
  import { createLinkAction } from "../../src/actions/link.svelte";

  let { onCapture }: { onCapture: (action: unknown, err: unknown) => void } =
    $props();

  // Locks gotcha #20: `createLinkAction` is a factory that captures the
  // router context via `getContext()`. Calling it from a `setTimeout` (or
  // any async callback) runs AFTER the component init lifecycle and outside
  // `current_component_context`, so Svelte 5 throws
  // `lifecycle_outside_component`. This is the user-visible signal that the
  // factory must be called during init, not lazily.
  setTimeout(() => {
    try {
      const action = createLinkAction();

      onCapture(action, null);
    } catch (err) {
      onCapture(null, err);
    }
  }, 0);
</script>
