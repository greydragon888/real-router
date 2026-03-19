<script lang="ts">
  import { getNavigator } from "@real-router/core";
  import { createRouteSource } from "@real-router/sources";
  import { setContext } from "svelte";

  import { createReactiveSource } from "./createReactiveSource.svelte";
  import { NAVIGATOR_KEY, ROUTE_KEY, ROUTER_KEY } from "./context";

  import type { Router } from "@real-router/core";
  import type { Snippet } from "svelte";

  let { router, children }: { router: Router; children: Snippet } = $props();

  const navigator = getNavigator(router);
  const source = createRouteSource(router);
  const reactive = createReactiveSource(source);

  setContext(ROUTER_KEY, router);
  setContext(NAVIGATOR_KEY, navigator);
  setContext(ROUTE_KEY, {
    navigator,
    get route() {
      return {
        get current() {
          return reactive.current.route;
        },
      };
    },
    get previousRoute() {
      return {
        get current() {
          return reactive.current.previousRoute;
        },
      };
    },
  });
</script>

{@render children()}
