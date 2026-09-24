<script lang="ts">
  import RouteExitProbe from "./RouteExitProbe.svelte";
  import TestRouterProvider from "./TestRouterProvider.svelte";

  import type {
    RouteExitHandler,
    UseRouteExitOptions,
  } from "../../src/composables/useRouteExit.svelte";
  import type { Router } from "@real-router/core";

  let {
    router,
    handler,
    options,
  }: {
    router: Router;
    handler: RouteExitHandler;
    options?: UseRouteExitOptions;
  } = $props();
</script>

<TestRouterProvider {router}>
  <RouteExitProbe {handler} {options} />
</TestRouterProvider>
