<script lang="ts">
  import { useRoute } from "../../src/composables/useRoute.svelte";

  import type { RouteContext } from "../../src/types";

  let { onCapture }: { onCapture: (result: RouteContext) => void } = $props();

  const ctx = useRoute();

  onCapture(ctx);
</script>

<div data-testid="route-name">{ctx.route.current?.name ?? "none"}</div>
<div data-testid="previous-route">{ctx.previousRoute.current?.name ?? "none"}</div>
