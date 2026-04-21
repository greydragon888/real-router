<script lang="ts">
  import RouterProvider from "../../src/RouterProvider.svelte";

  import type { ScrollRestorationOptions } from "../../src/dom-utils";
  import type { Router } from "@real-router/core";

  let {
    router,
    scrollRestoration,
  }: {
    router: Router;
    scrollRestoration: ScrollRestorationOptions;
  } = $props();
</script>

<RouterProvider {router} {scrollRestoration}>
  <div data-testid="child"></div>
</RouterProvider>
