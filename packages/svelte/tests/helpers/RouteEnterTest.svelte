<script lang="ts">
  import RouteEnterProbe from "./RouteEnterProbe.svelte";
  import TestRouterProvider from "./TestRouterProvider.svelte";

  import type { Router } from "@real-router/core";
  import type {
    RouteEnterHandler,
    UseRouteEnterOptions,
  } from "../../src/composables/useRouteEnter.svelte";

  let {
    router,
    handler,
    options,
  }: {
    router: Router;
    handler: RouteEnterHandler;
    options?: UseRouteEnterOptions;
  } = $props();
</script>

<TestRouterProvider {router}>
  <RouteEnterProbe {handler} {options} />
</TestRouterProvider>
