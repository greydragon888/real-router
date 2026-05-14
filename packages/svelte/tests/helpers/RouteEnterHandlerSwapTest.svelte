<script lang="ts">
  import RouteEnterProbe from "./RouteEnterProbe.svelte";
  import TestRouterProvider from "./TestRouterProvider.svelte";

  import type { Router } from "@real-router/core";
  import type {
    RouteEnterHandler,
    UseRouteEnterOptions,
  } from "../../src/composables/useRouteEnter.svelte";

  // Mirror of `RouteExitHandlerSwapTest` for `useRouteEnter`. The probe
  // captures `handlerA` at init; the parent toggles to `handlerB` via the
  // "swap" button; subsequent enter events must still invoke `handlerA`
  // (locks "Handler Is Captured At Init" gotcha).
  let {
    router,
    handlerA,
    handlerB,
    options,
  }: {
    router: Router;
    handlerA: RouteEnterHandler;
    handlerB: RouteEnterHandler;
    options?: UseRouteEnterOptions;
  } = $props();

  let currentHandler = $state<RouteEnterHandler>(handlerA);

  function switchHandler() {
    currentHandler = handlerB;
  }
</script>

<TestRouterProvider {router}>
  <RouteEnterProbe handler={currentHandler} {options} />
</TestRouterProvider>
<button data-testid="swap" onclick={switchHandler}>swap</button>
