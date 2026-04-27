<div data-route-root data-route-anim="fade">
  <h1>Route Animations</h1>
  <p>
    This example animates route changes via CSS <code>@keyframes</code> and
    the <code>useRouteExit</code> composable from
    <code>@real-router/svelte</code> — no View Transitions API. Three thin
    composables own the animation behavior (page-level fade/slide, hero
    morph, list FLIP), works in every modern browser including Firefox
    without VT, and gives you per-route timing control out of the box.
  </p>

  <h2>Scenarios to try</h2>
  <ol>
    <li>
      <strong>Per-route timing</strong>: click <em>About</em> (900 ms fade),
      then click <em>Products</em> (2100 ms slide). Each route picks its own
      animation via <code>data-route-anim</code> on its
      <code>[data-route-root]</code> wrapper.
    </li>
    <li>
      <strong>Sequential, not parallel</strong>: <code>useRouteExit</code>
      wraps <code>subscribeLeave</code> and returns a Promise; the router
      blocks until <code>getAnimations() + .finished</code> resolves. Exit
      fully completes <em>before</em> the next page mounts — no crossfade,
      no overlap. View Transitions gives you crossfade for free; the recipe
      gives you sequencing for free.
    </li>
    <li>
      <strong>Direction-aware slide</strong>: navigate to <em>Products</em>
      (forward — slide-from-right), then use the browser back button (back —
      slide-from-left). <code>data-nav-direction</code> on
      <code>&lt;html&gt;</code> is flipped by
      <code>createDirectionTracker(router)</code> (installed in
      <code>main.ts</code> before <code>usePlugin(browserPlugin)</code> so
      its popstate listener fires first).
    </li>
    <li>
      <strong>Skip on initial</strong>: reload this page — no animation on
      first mount. <code>router.start()</code> does not fire
      <code>subscribeLeave</code>.
    </li>
    <li>
      <strong>Skip same-route</strong>: click <em>Home</em> while already on
      Home — the router rejects with <code>SAME_STATES</code> and
      <code>useRouteExit</code>'s default <code>skipSameRoute: true</code>
      short-circuits sort/filter query-only navigations before the handler
      runs.
    </li>
    <li>
      <strong>Query-only suppression + list FLIP</strong>: open
      <em>Products</em> and switch sort (A → Z / Z → A) — the page itself
      does not fade (<code>usePageAnimator</code> skips same-route
      navigations by default), but <code>useListFlip</code> opts in via
      <code>skipSameRoute: false</code> and runs cards to their new
      positions. On <em>Query demo</em>: survivors translate, newly-visible
      items fade in, and items dropped by a narrowing filter fade out via
      <code>cloneNode</code> ghosts pinned at the captured rect (Svelte
      unmounts the originals before subscribe fires).
    </li>
    <li>
      <strong>Hero morph (manual FLIP)</strong>: open <em>Products</em>,
      click a product card. <code>useHeroMorph</code> captures the
      thumbnail's rect on <code>useRouteExit</code>; after the detail page
      mounts, <code>navigator.subscribe</code> fires an inverse-FLIP
      transform via the Web Animations API. Costs ~110 lines of composable
      code that VT gives you for free via
      <code>view-transition-name</code> pairing.
    </li>
    <li>
      <strong>Abort safety</strong>: click sidebar links rapid-fire — the
      <code>AbortSignal</code> exposed by <code>useRouteExit</code> triggers
      the abort-listener cleanup that strips the <code>.leaving</code>
      class from cancelled exits — no animation leaks.
    </li>
    <li>
      <strong>Reduced motion</strong>: set your OS to reduce motion —
      <code>animation: none</code> via media query collapses the keyframe.
      <code>Element.getAnimations()</code> returns <code>[]</code>, so
      <code>Promise.allSettled([])</code> in <code>usePageAnimator</code>
      resolves synchronously — the router never blocks.
    </li>
    <li>
      <strong>Cross-browser</strong>: works identically in Firefox without
      <code>document.startViewTransition</code>. The parallel
      <code>view-transitions/</code> example silently degrades to no
      animation in browsers without VT support; this one runs everywhere.
    </li>
  </ol>

  <p>
    See <em>About</em> for the side-by-side comparison with View
    Transitions: when each approach is the right call, and what the recipe
    cannot do that VT can.
  </p>
</div>
