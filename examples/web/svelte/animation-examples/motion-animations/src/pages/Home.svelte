<div>
  <h1>Motion Animations</h1>
  <p>
    Router-coordinated recipe via Svelte's built-in
    <code>transition:</code> directives —
    <a href="https://svelte.dev/docs/svelte/transition">first-class
    Svelte primitives</a>, no external library. The
    <code>&#123;#key exitToken.current&#125;</code> block in
    <code>TransitionHost.svelte</code> wraps a single page-level
    <code>&lt;div&gt;</code> with <code>in:fly</code> and
    <code>out:fly</code> transitions; the key changes inside
    <code>useRouteExit</code> (from <code>@real-router/svelte</code>),
    re-instantiating the block. The router blocks on a Promise
    resolved when the element's <code>onoutroend</code> fires — URL
    and UI stay in lock-step, same semantics as the other three
    examples.
  </p>

  <h2>Scenarios to try</h2>
  <ol>
    <li>
      <strong>Cross-route fade + slide</strong>: click <em>About</em>.
      The page-level <code>&lt;div&gt;</code> slides out left
      (<code>{`out:fly={{ x: -20, duration: 900 }}`}</code>), the new
      one slides in from right. Sequential — Svelte's transition
      pipeline runs out fully before in starts on the new element.
    </li>
    <li>
      <strong>Skip on initial</strong>: reload this page — the heading
      is visible immediately. We track first-mount via a
      <code>$state</code> flag and zero the entry duration on the very
      first instantiation, equivalent to motion-react's
      <code>{`initial={false}`}</code>.
    </li>
    <li>
      <strong>Skip same-route</strong>: click <em>Home</em> while on
      Home — the router rejects with <code>SAME_STATES</code> before
      re-render; <code>exitToken</code> is not bumped so
      <code>&#123;#key&#125;</code> does not re-instantiate.
    </li>
    <li>
      <strong>Reduced motion</strong>: with
      <code>prefers-reduced-motion: reduce</code>, the transition
      durations on transform animations should be respected — Svelte's
      transitions honor the media query when used with
      <code>{`reduceMotion: "user"`}</code> patterns. Implementation
      detail of the chosen transition function.
    </li>
    <li>
      <strong>Abort safety (rapid clicks)</strong>: click sidebar
      links rapid-fire — Svelte's transition pipeline queues out/in;
      intermediate routes' entrances are skipped if a newer
      navigation arrives.
    </li>
  </ol>

  <h2>Differences from motion-react</h2>
  <p>
    motion-react ships <code>layoutId</code> for cross-component hero
    morphs and <code>{`<motion.li layout>`}</code> for automatic list
    reorder. Svelte's built-in transitions are
    <strong>per-element entry/exit</strong> only — they do not pair
    elements across the route boundary or animate position changes
    automatically. For those scenarios, see
    <code>route-animations/</code>'s <code>useHeroMorph</code> (~110
    LOC) and <code>useListFlip</code> (~230 LOC) — manual WAAPI
    inverse-FLIP.
  </p>
  <p>
    What this example demonstrates uniquely:
    <strong>library-free, router-coordinated entry/exit</strong>. The
    router stays blocked on the page-level exit Promise (resolved by
    <code>onoutroend</code>), so URL and UI stay in lock-step — same
    semantics as <code>route-animations/</code> and
    <code>page-animations/</code>, but expressed through Svelte's
    declarative transition directives instead of CSS keyframes +
    <code>animationend</code> bookkeeping or an external animation
    library.
  </p>

  <p>
    See <em>About</em> for the side-by-side comparison with all four
    approaches and when each is the right call.
  </p>
</div>
