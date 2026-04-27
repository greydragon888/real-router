<div>
  <h1>View Transitions</h1>
  <p>
    This example demonstrates browser's View Transitions API integration with
    real-router via a single <code>viewTransitions</code> prop on
    <code>RouterProvider</code>. The utility blocks the router until the
    browser has captured the old DOM snapshot, so the URL in the address bar
    updates <em>under</em> the VT freeze frame — exit and entry animations
    bracket the state change instead of racing ahead of it.
  </p>

  <h2>Scenarios to try</h2>
  <ol>
    <li>
      <strong>Cross-route slide</strong>: click any sidebar link —
      <code>::view-transition-old(root)</code> slides out left,
      <code>::view-transition-new(root)</code> slides in right, with a black
      curtain in the middle.
    </li>
    <li>
      <strong>Direction-aware</strong>: use browser back/forward — the
      animation direction flips. <code>data-nav-direction</code> on
      <code>&lt;html&gt;</code> is toggled from <code>subscribeLeave</code>
      based on a popstate flag.
    </li>
    <li>
      <strong>Skip on initial</strong>: reload this page — no animation on
      first mount (router.start() does not fire subscribeLeave).
    </li>
    <li>
      <strong>Skip same-route</strong>: click <em>Home</em> while already on
      Home — the router rejects with <code>SAME_STATES</code> and VT never
      opens.
    </li>
    <li>
      <strong>Query-only scope</strong>: open <em>Products</em> and switch
      the sort (A → Z / Z → A), or open <em>Query demo</em> and change the
      filter. <code>html.vt-query-only</code> kills the root curtain so only
      the local list container fades in place.
    </li>
    <li>
      <strong>Hero morph</strong>: open <em>Products</em>, click a product
      card — only that thumb keeps its <code>view-transition-name</code>
      (set via <code>html.vt-hero-morph[data-vt-hero-id]</code>), then
      FLIP-morphs into the detail cover. Root softens to a plain fade so the
      morph is visible.
    </li>
    <li>
      <strong>Abort safety</strong>: click sidebar links rapid-fire — older
      transitions are skipped, the last click wins, no stale animations leak.
    </li>
    <li>
      <strong>Reduced motion</strong>: set your OS to reduce motion —
      <code>::view-transition-*</code> duration collapses to zero, the swap
      is instant but the pipeline still runs.
    </li>
    <li>
      <strong>Feature fallback</strong>: the utility auto-detects
      <code>document.startViewTransition</code>. Supported in Chromium 111+,
      Safari 18+, and Firefox 147+ — older browsers silently skip animations.
    </li>
  </ol>

  <p>
    The utility itself is one prop:
    <code>&lt;RouterProvider viewTransitions&gt;</code>. Animation
    customisation lives in <code>transitions.css</code> via
    <code>::view-transition-*</code> pseudo-elements. Per-scenario scope
    control (query-only, hero-morph) is a policy decision — this demo sets
    classes on <code>&lt;html&gt;</code> from <code>subscribeLeave</code>
    and lets CSS gate <code>view-transition-name</code> accordingly.
  </p>
  <p>
    <strong>Heads up:</strong> durations in this demo are intentionally long
    (2400 ms root, 800 ms per-area) so each phase is clearly visible. During
    root-scope playback the real DOM is under rendering suppression and not
    hit-testable, so clicks will feel blocked until the animation ends —
    this is the CSS VT spec behaviour, not a router bug. See the
    <em>About</em> page for details. In production keep animations under
    ~400 ms so the block is imperceptible.
  </p>
</div>
