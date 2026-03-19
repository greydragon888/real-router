<script lang="ts">
  import Lazy from "../../src/components/Lazy.svelte";
  import TestRouterProvider from "./TestRouterProvider.svelte";

  import type { Router } from "@real-router/core";
  import type { Component } from "svelte";

  let {
    router,
    loader,
    fallback,
  }: {
    router: Router;
    loader: () => Promise<{ default: Component }>;
    fallback?: Component | undefined;
  } = $props();
</script>

<TestRouterProvider {router}>
  <Lazy {loader} {fallback} />
</TestRouterProvider>
