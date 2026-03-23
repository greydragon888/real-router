<script lang="ts">
  import { useRouterTransition } from "../../src/composables/useRouterTransition.svelte";

  let { onCapture }: { onCapture: (result: unknown) => void } = $props();

  const transition = useRouterTransition();

  onCapture(transition);
</script>

<div data-testid="is-transitioning">{String(transition.current.isTransitioning)}</div>
