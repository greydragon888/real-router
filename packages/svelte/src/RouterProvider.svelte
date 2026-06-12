<script lang="ts">
  import { getNavigator } from "@real-router/core";
  import { createRouteSource } from "@real-router/sources";
  import {
    createRouteAnnouncer,
    createScrollRestoration,
    createScrollSpy,
    createViewTransitions,
  } from "./dom-utils";
  import { setContext, untrack } from "svelte";

  import { createReactiveSource } from "./createReactiveSource.svelte";
  import { createRouteContext } from "./createRouteContext.svelte";
  import { NAVIGATOR_KEY, ROUTE_KEY, ROUTER_KEY } from "./context";

  import type { ScrollRestorationOptions, ScrollSpyOptions } from "./dom-utils";
  import type { Router } from "@real-router/core";
  import type { Snippet } from "svelte";

  let {
    router,
    children,
    announceNavigation,
    scrollRestoration,
    scrollSpy,
    viewTransitions,
  }: {
    router: Router;
    children: Snippet;
    announceNavigation?: boolean | undefined;
    scrollRestoration?: ScrollRestorationOptions | undefined;
    scrollSpy?: ScrollSpyOptions | undefined;
    viewTransitions?: boolean | undefined;
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
    // Pin primitive $derived deps as explicit dependencies of this effect
    // BEFORE constructing the utility. The four `void srX` reads make
    // intent unambiguous: even if `createScrollRestoration` throws after
    // partial argument evaluation (e.g. invalid `mode` rejected), every
    // srMode/srAnchor/srBehavior/srStorageKey is already in this effect's
    // dependency set — the next change to any of them re-runs the effect
    // and the utility gets rebuilt. Without these reads, the dependency
    // tracking would depend on Svelte's argument-evaluation order inside
    // the factory call, which is brittle. Non-primitive refs (like
    // `scrollContainer` — a DOM element that changes ref every render but
    // is identity-equal in practice) are deliberately read via `untrack`
    // to keep this effect from re-running on every parent re-render.
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

  const spyEnabled = $derived(
    scrollSpy !== undefined && scrollSpy.selector !== "",
  );
  const spySelector = $derived(scrollSpy?.selector);
  const spyRootMargin = $derived(scrollSpy?.rootMargin);

  $effect(() => {
    if (!spyEnabled || !spySelector) return;
    void spyRootMargin;
    const spy = createScrollSpy(router, {
      selector: spySelector,
      rootMargin: spyRootMargin,
      scrollContainer: untrack(() => scrollSpy?.scrollContainer),
    });
    return () => spy.destroy();
  });

  $effect(() => {
    if (!viewTransitions) return;
    const vt = createViewTransitions(router);
    return () => vt.destroy();
  });

  // svelte-ignore state_referenced_locally
  // The router instance is stable for the provider lifetime.
  const navigator = getNavigator(router);
  // svelte-ignore state_referenced_locally
  // The route source intentionally captures the initial router instance.
  const source = createRouteSource(router);
  const reactive = createReactiveSource(source);
  const routeContext = createRouteContext(navigator, reactive);

  // svelte-ignore state_referenced_locally
  // Context exposes the same stable router instance for this provider.
  setContext(ROUTER_KEY, router);
  // svelte-ignore state_referenced_locally
  // Context exposes the navigator derived once from the stable router.
  setContext(NAVIGATOR_KEY, navigator);
  setContext(ROUTE_KEY, routeContext);
</script>

{@render children()}
