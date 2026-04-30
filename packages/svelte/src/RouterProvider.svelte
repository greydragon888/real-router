<script lang="ts">
  import { getNavigator } from "@real-router/core";
  import { createRouteSource } from "@real-router/sources";
  import {
    createRouteAnnouncer,
    createScrollRestoration,
    createViewTransitions,
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
    viewTransitions,
  }: {
    router: Router;
    children: Snippet;
    announceNavigation?: boolean;
    scrollRestoration?: ScrollRestorationOptions;
    viewTransitions?: boolean;
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
  const srBehavior = $derived(scrollRestoration?.behavior);
  const srStorageKey = $derived(scrollRestoration?.storageKey);

  $effect(() => {
    if (!srEnabled) return;
    // Read scrollRestoration object props via `untrack` for non-primitive
    // refs that naturally change each render. Primitive $derived memos
    // (mode/anchor/behavior/storageKey) drive re-runs.
    void srMode;
    void srAnchor;
    void srBehavior;
    void srStorageKey;
    const sr = createScrollRestoration(router, {
      mode: srMode,
      anchorScrolling: srAnchor,
      behavior: srBehavior,
      storageKey: srStorageKey,
      scrollContainer: untrack(() => scrollRestoration?.scrollContainer),
    });
    return () => sr.destroy();
  });

  $effect(() => {
    if (!viewTransitions) return;
    const vt = createViewTransitions(router);
    return () => vt.destroy();
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
