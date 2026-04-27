<script lang="ts">
  import { useRouteAnimation } from "../use-route-animation.svelte";

  let ref: HTMLDivElement | undefined = $state();

  useRouteAnimation(() => ref, { entryClass: "fade-in", exitClass: "fade-out" });
</script>

<div bind:this={ref}>
  <h1>Page Animations</h1>
  <p>
    Distributed per-page recipe: each page calls
    <code>{`useRouteAnimation(() => ref, …)`}</code> in its own component.
    The composable is built on <code>useRouteExit</code> +
    <code>useRouteEnter</code> from <code>@real-router/svelte</code>, both
    of which subscribe to the router for the page's lifetime. No
    centralised policy module — animation logic lives next to the page
    that owns it.
  </p>

  <h2>Scenarios to try</h2>
  <ol>
    <li>
      <strong>Cross-route fade</strong>: click <em>About</em>. Home's
      <code>fade-out</code> class runs, the composable's Promise resolves
      when <code>Element.getAnimations() + .finished</code> settle, the
      router activates About, and About's <code>fade-in</code> plays via
      its own <code>useRouteAnimation</code> on the new mount.
    </li>
    <li>
      <strong>Per-page customisation</strong>: each page picks its own
      class names. <em>Products</em> uses <code>slide-out</code> /
      <code>slide-in</code> for a horizontal slide; everything else
      fades. The composable is route-agnostic — pages choose semantics.
    </li>
    <li>
      <strong>Sequential timing</strong>: same as the centralised
      recipe — <code>useRouteExit</code> returns a Promise, so the router
      blocks until the exit animation completes before the next page
      mounts.
    </li>
    <li>
      <strong>Skip same-route</strong>: open <em>Query demo</em> and
      switch filter. <code>useRouteExit</code>'s default
      <code>skipSameRoute: true</code> short-circuits when
      <code>route.name === nextRoute.name</code> — no leave / entry flash
      on each filter click.
    </li>
    <li>
      <strong>Skip-initial entry</strong>: reload this page — the
      fade-in does not play. <code>useRouteEnter</code> requires a
      <code>previousRoute</code> in its context, so initial-load mounts
      do not trigger entry animations. Click <em>About</em> and back to
      <em>Home</em>: now the fade-in plays.
    </li>
    <li>
      <strong>Reduced motion</strong>: with
      <code>prefers-reduced-motion: reduce</code> the keyframes collapse
      to <code>animation: none</code>.
      <code>Element.getAnimations()</code> returns <code>[]</code>, so
      <code>Promise.allSettled([])</code> in the exit handler resolves
      synchronously — the router never blocks.
    </li>
  </ol>

  <h2>What this approach gives up</h2>
  <p>
    See <em>About</em> for the full comparison with
    <code>view-transitions/</code> and <code>route-animations/</code>.
    The short version: distributed per-page composables cover entry +
    exit cleanly, but cross-page coordination (hero morph between
    routes, list FLIP with ghost exits) needs shared state — module-level
    variables or a custom event bus — because each page's composable
    only sees its own lifecycle.
  </p>
</div>
