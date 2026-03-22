<script lang="ts">
  import { useRouterTransition } from "../../../src/composables/useRouterTransition.svelte";

  import type { RouterTransitionSnapshot } from "@real-router/sources";

  let {
    onTransition,
  }: {
    onTransition?: (t: RouterTransitionSnapshot) => void;
  } = $props();

  const transition = useRouterTransition();

  $effect(() => {
    const current = transition.current;

    onTransition?.(current);
  });
</script>
