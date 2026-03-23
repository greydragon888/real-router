<script lang="ts">
  import RouteCapture from "./RouteCapture.svelte";
  import TestRouterProvider from "./TestRouterProvider.svelte";

  import type { RouteContext } from "../../src/types";
  import type { Router } from "@real-router/core";

  let { router, onCapture }: { router: Router; onCapture: (result: RouteContext) => void } = $props();
</script>

<TestRouterProvider {router}>
  <RouteCapture {onCapture} />
</TestRouterProvider>
