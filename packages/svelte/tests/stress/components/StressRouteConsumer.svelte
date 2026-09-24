<script lang="ts">
  import { useRoute } from "../../../src/composables/useRoute.svelte";

  let { onRender }: { onRender?: (() => void) | undefined } = $props();

  const { route } = useRoute();

  $effect(() => {
    void route.current;
    onRender?.();
  });
</script>

<div data-testid="route-consumer">{route.current.name}</div>
