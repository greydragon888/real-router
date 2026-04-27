<template>
  <div>
    <h1>Motion Animations</h1>
    <p>
      Router-coordinated recipe via Vue's built-in
      <a href="https://vuejs.org/guide/built-ins/transition.html"
        ><code>&lt;Transition&gt;</code></a
      >
      component — first-class Vue primitive, no external library. The
      <code>:key="exitToken"</code> binding on the inner
      <code>&lt;div&gt;</code> in <code>App.vue</code> triggers a
      key-driven remount on each token bump (set inside
      <code>useRouteExit</code> from <code>@real-router/vue</code>);
      <code>&lt;Transition mode="out-in"&gt;</code> sequences the
      leave hooks before the enter hooks. The router blocks on a
      Promise resolved when the
      <code>@after-leave</code> event fires — URL and UI stay in
      lock-step, same semantics as the other three examples.
    </p>

    <h2>Scenarios to try</h2>
    <ol>
      <li>
        <strong>Cross-route fade + slide</strong>: click
        <em>About</em>. The page-level <code>&lt;div&gt;</code> fades
        / slides out
        (<code>opacity: 0; transform: translateX(-20px)</code>), the
        new one slides in. Sequential — Vue's
        <code>mode="out-in"</code> guarantees leave fully completes
        before enter starts.
      </li>
      <li>
        <strong>Skip on initial</strong>: reload this page — the
        heading is visible immediately. The
        <code>:appear="false"</code> prop on
        <code>&lt;Transition&gt;</code> suppresses the very first
        entry animation, equivalent to motion-react's
        <code>&lt;AnimatePresence initial=&#123;false&#125;&gt;</code>.
      </li>
      <li>
        <strong>Skip same-route</strong>: click <em>Home</em> while
        on Home — the router rejects with <code>SAME_STATES</code>
        before re-render; <code>exitToken</code> is not bumped so
        <code>&lt;Transition&gt;</code> sees no change.
      </li>
      <li>
        <strong>Reduced motion</strong>: with
        <code>prefers-reduced-motion: reduce</code>, the
        <code>@media</code> block in <code>App.vue</code> collapses
        <code>.page-enter-active</code> /
        <code>.page-leave-active</code> to
        <code>transition: none</code>. Vue still fires
        <code>@after-leave</code> on the next frame, so the router
        unblocks immediately and navigation completes without visible
        animation.
      </li>
      <li>
        <strong>Abort safety (rapid clicks)</strong>: click sidebar
        links rapid-fire — Vue's transition pipeline drops queued
        leave/enter pairs when the key changes faster than the
        animation; intermediate routes' entrances are skipped.
      </li>
    </ol>

    <h2>Differences from motion-react</h2>
    <p>
      motion-react ships <code>layoutId</code> for cross-component
      hero morphs and
      <code>&lt;motion.li layout&gt;</code> for automatic list reorder.
      Vue's built-in <code>&lt;Transition&gt;</code> is
      <strong>per-element entry/exit</strong> only — it does not pair
      elements across the route boundary or animate position changes
      automatically. (Vue does ship
      <code>&lt;TransitionGroup&gt;</code> for list reorder via FLIP,
      but it doesn't pair elements across routes.) For cross-route
      hero morph, see <code>route-animations/</code>'s
      <code>useHeroMorph</code> (~110 LOC) — manual WAAPI inverse-FLIP.
    </p>
    <p>
      What this example demonstrates uniquely:
      <strong>library-free, router-coordinated entry/exit</strong>.
      The router stays blocked on the page-level exit Promise
      (resolved by <code>@after-leave</code>), so URL and UI stay in
      lock-step — same semantics as
      <code>route-animations/</code> and
      <code>page-animations/</code>, but expressed through Vue's
      declarative <code>&lt;Transition&gt;</code> component instead
      of CSS keyframes + <code>animationend</code> bookkeeping or an
      external animation library.
    </p>

    <p>
      See <em>About</em> for the side-by-side comparison with all
      four approaches and when each is the right call.
    </p>
  </div>
</template>
