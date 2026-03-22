<script lang="ts">
  import { useRoute } from "../../../src/composables/useRoute.svelte";

  let { onRender }: { onRender?: () => void } = $props();

  const { route } = useRoute();

  $effect(() => {
    route.current;
    onRender?.();
  });
</script>

<div data-testid="route-consumer">{route.current?.name ?? "none"}</div>
