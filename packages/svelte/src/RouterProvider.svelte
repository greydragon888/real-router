<script lang="ts">
  import { getNavigator } from "@real-router/core";
  import { createRouteSource } from "@real-router/sources";
  import {
    createRouteAnnouncer,
    createScrollRestoration,
  } from "./dom-utils";
  import { setContext, untrack } from "svelte";

  import { createReactiveSource } from "./createReactiveSource.svelte";
  import { createRouteContext } from "./createRouteContext.svelte";
  import { NAVIGATOR_KEY, ROUTE_KEY, ROUTER_KEY } from "./context";

  import type { ScrollRestorationOptions } from "./dom-utils";
  import type { Router } from "@real-router/core";
  import type { Snippet } from "svelte";

  let {
    router,
    children,
    announceNavigation,
    scrollRestoration,
  }: {
    router: Router;
    children: Snippet;
    announceNavigation?: boolean;
    scrollRestoration?: ScrollRestorationOptions;
  } = $props();

  $effect(() => {
    if (!announceNavigation) return;
    const announcer = createRouteAnnouncer(router);
    return () => announcer.destroy();
  });

  // $derived memoizes by === so inline `{ mode: "restore" }` doesn't thrash:
  // each parent re-render produces a new object ref, but .mode stays "restore"
  // → $derived returns the same primitive → $effect doesn't re-run.
  const srEnabled = $derived(scrollRestoration !== undefined);
  const srMode = $derived(scrollRestoration?.mode);
  const srAnchor = $derived(scrollRestoration?.anchorScrolling);

  $effect(() => {
    if (!srEnabled) return;
    // scrollContainer is a function ref that naturally changes each render.
    // Read it via `untrack` so this $effect does NOT depend on the parent
    // `scrollRestoration` signal. Without this, a new inline options object
    // would re-run the effect regardless of the primitive $derived memos.
    const sr = createScrollRestoration(router, {
      mode: srMode,
      anchorScrolling: srAnchor,
      scrollContainer: untrack(() => scrollRestoration?.scrollContainer),
    });
    return () => sr.destroy();
  });

  const navigator = getNavigator(router);
  const source = createRouteSource(router);
  const reactive = createReactiveSource(source);
  const routeContext = createRouteContext(navigator, reactive);

  setContext(ROUTER_KEY, router);
  setContext(NAVIGATOR_KEY, navigator);
  setContext(ROUTE_KEY, routeContext);
</script>

{@render children()}
