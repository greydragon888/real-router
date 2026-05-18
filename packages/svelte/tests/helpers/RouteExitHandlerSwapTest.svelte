<script lang="ts">
  import RouteExitProbe from "./RouteExitProbe.svelte";
  import TestRouterProvider from "./TestRouterProvider.svelte";

  import type { Router } from "@real-router/core";
  import type {
    RouteExitHandler,
    UseRouteExitOptions,
  } from "../../src/composables/useRouteExit.svelte";

  // Two distinct handler references. The test swaps `handler` between them at
  // runtime via the exported `setHandler` accessor in the parent test, then
  // navigates to verify that the FIRST handler (the one captured during the
  // probe's init) is still the one being called. If Svelte composables
  // re-captured the prop on each render, the second handler would win and
  // this test would fail — that's the negative assertion for CLAUDE.md
  // "useRouteExit / useRouteEnter Handler Is Captured At Init".
  let {
    router,
    handlerA,
    handlerB,
    options,
  }: {
    router: Router;
    handlerA: RouteExitHandler;
    handlerB: RouteExitHandler;
    options?: UseRouteExitOptions;
  } = $props();

  let currentHandler = $state<RouteExitHandler>(handlerA);

  function switchHandler() {
    currentHandler = handlerB;
  }
</script>

<TestRouterProvider {router}>
  <RouteExitProbe handler={currentHandler} {options} />
</TestRouterProvider>
<button data-testid="swap" onclick={switchHandler}>swap</button>
