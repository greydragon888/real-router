<script lang="ts">
  import RouterProvider from "../../src/RouterProvider.svelte";

  import type { Router } from "@real-router/core";

  let {
    router,
    announceNavigation = false,
  }: { router: Router; announceNavigation?: boolean } = $props();
</script>

<RouterProvider {router} {announceNavigation}>
  <div data-testid="child"></div>
</RouterProvider>
