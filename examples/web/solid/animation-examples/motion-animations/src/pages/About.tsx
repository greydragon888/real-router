import type { JSX } from "solid-js";

export function About(): JSX.Element {
  return (
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
        regions, automatic crossfade for everything else. Smallest code, biggest
        browser support gap (Firefox 145- has no API). Hero morphs and
        persistent-shell crossfades come free.
      </p>

      <h2>route-animations/</h2>
      <p>
        Centralised via three thin hooks (<code>usePageAnimator</code>,{" "}
        <code>useHeroMorph</code>, <code>useListFlip</code>) called once at the
        top of <code>App</code>. Each hook wraps <code>useRouteExit</code> from{" "}
        <code>@real-router/solid</code> with its own DOM recipe; pages stay
        declarative — they only mark <code>[data-route-root]</code> /{" "}
        <code>[data-flip-key]</code> attributes. Cross-route coordination (hero
        rects, list FLIP, ghost clones) lives in plain <code>let</code>{" "}
        variables inside the hooks.
      </p>

      <h2>page-animations/</h2>
      <p>
        Distributed via <code>useRouteAnimation(() ={">"} ref, …)</code> per
        page. Each page calls the hook in its own component; the hook itself is
        built on <code>useRouteExit</code> + <code>useRouteEnter</code> from{" "}
        <code>@real-router/solid</code>. Encapsulated, simpler mental model,
        less boilerplate per new page once the hook exists. Cross-page
        coordination needs shared state because each component's hook only sees
        its own lifecycle.
      </p>

      <h2>motion-animations/ (this example)</h2>
      <p>
        Router-coordinated via{" "}
        <a href="https://github.com/solidjs-community/solid-motionone">
          <code>solid-motionone</code>
        </a>{" "}
        — Solid bindings around <a href="https://motion.dev">Motion One</a>.{" "}
        <code>&lt;Presence exitBeforeEnter&gt;</code> wraps a single page-level{" "}
        <code>&lt;Motion.div&gt;</code> keyed by an <code>exitToken</code>{" "}
        counter bumped inside <code>useRouteExit</code>. The Promise the router
        awaits resolves on the exiting element's <code>onMotionComplete</code> —
        URL and UI stay in lock-step like the other three examples.
      </p>
      <p>
        <strong>Difference from motion-react:</strong> the React equivalent (
        <code>motion</code> v12+) ships <code>layoutId</code> for
        cross-component hero morphs and <code>&lt;motion.li layout&gt;</code>{" "}
        for automatic list reorder animations. Motion One — and therefore
        solid-motionone — does not bundle these layout primitives. For those
        scenarios in Solid, see <code>route-animations/</code> for the
        hand-rolled WAAPI recipes (<code>useHeroMorph</code> ≈ 110 LOC,{" "}
        <code>useListFlip</code> ≈ 230 LOC).
      </p>

      <h2>Decision tree</h2>
      <ul>
        <li>
          Hero morph or persistent-shell static regions, modern browsers? →{" "}
          <code>view-transitions/</code> (cheapest code).
        </li>
        <li>
          Cross-browser, custom timing per route, hero morph, <em>and</em> list
          FLIP with ghosts, full router coordination? →{" "}
          <code>route-animations/</code>.
        </li>
        <li>
          Cross-browser, simple entry / exit per page, no hero morph, no
          coordinated reorder, encapsulation? → <code>page-animations/</code>.
        </li>
        <li>
          Cross-browser, declarative library-driven page transitions, willing to
          add a small dependency, comfortable falling back to manual recipes for
          hero morph / list FLIP? → <code>motion-animations/</code> (this).
        </li>
      </ul>

      <h2>What this example demonstrates uniquely</h2>
      <p>
        <strong>
          Library-driven entry/exit with router-coordinated semantics.
        </strong>{" "}
        The router stays blocked on the page-level exit Promise (resolved by{" "}
        <code>onMotionComplete</code>), so URL and UI stay in lock-step — same
        semantics as <code>route-animations/</code> and{" "}
        <code>page-animations/</code>, but the entry / exit choreography is
        expressed through library primitives (declarative <code>animate</code> /{" "}
        <code>exit</code> props on Motion components) instead of hand-rolled CSS
        keyframes + <code>animationend</code> bookkeeping.
      </p>

      <h2>The wiring</h2>
      <p>
        See <code>src/main.tsx</code>, <code>src/App.tsx</code>, and{" "}
        <code>src/use-route-exit-coordination.ts</code>.{" "}
        <code>useRouteExitCoordination()</code> bridges the leave-window with{" "}
        <code>&lt;Presence&gt;</code>: it calls <code>useRouteExit</code> from{" "}
        <code>@real-router/solid</code> with a handler that bumps an{" "}
        <code>exitToken</code> (driving the keyed <code>&lt;Show&gt;</code>{" "}
        remount, which Presence runs exit on) and returns a Promise resolved
        when Motion fires <code>onMotionComplete</code>. The abort signal from{" "}
        <code>useRouteExit</code> resolves the same Promise on rapid navigation,
        so the router pipeline drains cleanly. Entry animations are declarative
        — the <code>initial</code> / <code>animate</code> props on{" "}
        <code>Motion.div</code> in <code>App.tsx</code>; no hook involvement
        needed because Motion One handles mount-time animation natively.
      </p>
    </div>
  );
}
