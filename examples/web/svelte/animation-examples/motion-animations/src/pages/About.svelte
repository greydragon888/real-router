<div>
  <h1>Four approaches, side by side</h1>
  <p>
    This monorepo ships four first-class examples of router-coordinated
    animations. They cover overlapping ground but emphasise different
    trade-offs.
  </p>

  <h2>view-transitions/</h2>
  <p>
    Browser-driven via <code>document.startViewTransition</code>.
    Pixel-level snapshots of old and new DOM, automatic FLIP for named
    regions, automatic crossfade for everything else. Smallest code,
    biggest browser support gap (Firefox 145- has no API). Hero morphs
    and persistent-shell crossfades come free.
  </p>

  <h2>route-animations/</h2>
  <p>
    Centralised via three thin composables (<code>usePageAnimator</code>,
    <code>useHeroMorph</code>, <code>useListFlip</code>) called once at
    the top of an inner component. Each composable wraps
    <code>useRouteExit</code> from <code>@real-router/svelte</code>
    with its own DOM recipe; pages stay declarative — they only mark
    <code>[data-route-root]</code> / <code>[data-flip-key]</code>
    attributes. Cross-route coordination (hero rects, list FLIP, ghost
    clones) lives in plain <code>let</code> variables inside the
    composables.
  </p>

  <h2>page-animations/</h2>
  <p>
    Distributed via <code>{`useRouteAnimation(() => ref, …)`}</code>
    per page. Each page calls the composable in its own component; the
    composable itself is built on <code>useRouteExit</code> +
    <code>useRouteEnter</code> from <code>@real-router/svelte</code>.
    Encapsulated, simpler mental model, less boilerplate per new page
    once the composable exists. Cross-page coordination needs shared
    state because each component's composable only sees its own
    lifecycle.
  </p>

  <h2>motion-animations/ (this example)</h2>
  <p>
    Router-coordinated via Svelte's built-in
    <code>transition:</code> directives.
    <code>&#123;#key exitToken.current&#125;</code> wraps a single
    page-level <code>&lt;div&gt;</code> with
    <code>in:fly</code> / <code>out:fly</code> transitions;
    re-instantiating the block via key change triggers the out
    transition on the cached old subtree. The Promise the router
    awaits resolves on the element's <code>onoutroend</code> — URL
    and UI stay in lock-step like the other three examples.
  </p>
  <p>
    <strong>Difference from motion-react:</strong> the React
    equivalent (<code>motion</code> v12+) ships <code>layoutId</code>
    for cross-component hero morphs and
    <code>{`<motion.li layout>`}</code> for automatic list reorder
    animations. Svelte's transitions are per-element entry/exit only.
    For those scenarios in Svelte, see <code>route-animations/</code>
    for the hand-rolled WAAPI recipes.
  </p>

  <h2>Decision tree</h2>
  <ul>
    <li>
      Hero morph or persistent-shell static regions, modern
      browsers? → <code>view-transitions/</code> (cheapest code).
    </li>
    <li>
      Cross-browser, custom timing per route, hero morph,
      <em>and</em> list FLIP with ghosts, full router coordination?
      → <code>route-animations/</code>.
    </li>
    <li>
      Cross-browser, simple entry / exit per page, no hero morph, no
      coordinated reorder, encapsulation? →
      <code>page-animations/</code>.
    </li>
    <li>
      Cross-browser, library-free declarative page transitions via
      Svelte's built-in <code>transition:</code> directives? →
      <code>motion-animations/</code> (this).
    </li>
  </ul>

  <h2>What this example demonstrates uniquely</h2>
  <p>
    <strong>Library-free, router-coordinated entry/exit using
    Svelte's first-class language features.</strong> The router stays
    blocked on the page-level exit Promise (resolved by
    <code>onoutroend</code>), so URL and UI stay in lock-step — same
    semantics as <code>route-animations/</code> and
    <code>page-animations/</code>, but the entry / exit choreography
    is expressed through Svelte's declarative transition directives
    (<code>in:fly</code>, <code>out:fly</code>) instead of
    hand-rolled CSS keyframes + <code>animationend</code> bookkeeping
    or an external animation library.
  </p>

  <h2>The wiring</h2>
  <p>
    See <code>src/main.ts</code>, <code>src/App.svelte</code>,
    <code>src/TransitionHost.svelte</code>, and
    <code>src/use-route-exit-coordination.svelte.ts</code>.
    <code>useRouteExitCoordination()</code> bridges the leave-window
    with the <code>{`{#key}`}</code> block: it calls
    <code>useRouteExit</code> from <code>@real-router/svelte</code>
    with a handler that bumps an <code>exitToken.current</code>
    counter (driving Svelte's keyed re-instantiation, which fires the
    out transition) and returns a Promise resolved when the element
    fires <code>onoutroend</code>. The abort signal from
    <code>useRouteExit</code> resolves the same Promise on rapid
    navigation, so the router pipeline drains cleanly. Entry
    animations are declarative — the <code>in:fly</code> directive on
    the host <code>&lt;div&gt;</code> in
    <code>TransitionHost.svelte</code>.
  </p>
</div>
