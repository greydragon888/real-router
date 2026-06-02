<script lang="ts">
  import RouterProvider from "../../src/RouterProvider.svelte";

  import type { ScrollSpyOptions } from "../../src/dom-utils";
  import type { Router } from "@real-router/core";

  let {
    router,
    scrollSpy,
  }: {
    router: Router;
    scrollSpy?: ScrollSpyOptions | undefined;
  } = $props();
</script>

<RouterProvider {router} {scrollSpy}>
  <div data-testid="child"></div>
</RouterProvider>
