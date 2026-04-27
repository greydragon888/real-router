import type { JSX } from "react";

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
        <code>useHeroMorph</code>, <code>useListFlip</code>) called once at
        the top of <code>App</code>. Each hook wraps{" "}
        <code>useRouteExit</code> from <code>@real-router/react</code> with
        its own DOM recipe; pages stay declarative — they only mark{" "}
        <code>[data-route-root]</code> / <code>[data-flip-key]</code>{" "}
        attributes. Cross-route coordination (hero rects, list FLIP, ghost
        clones) lives in module-level refs inside the hooks.
      </p>

      <h2>page-animations/</h2>
      <p>
        Distributed via <code>useRouteAnimation(ref, …)</code> per page.
        Each page calls the hook in its own component; the hook itself is
        built on <code>useRouteExit</code> + <code>useRouteEnter</code>{" "}
        from <code>@real-router/react</code>. Encapsulated, simpler mental
        model, less boilerplate per new page once the hook exists.
        Cross-page coordination needs shared state because each
        component&apos;s hook only sees its own lifecycle.
      </p>

      <h2>motion-animations/ (this example)</h2>
      <p>
        Router-coordinated via <code>motion</code> (formerly Framer Motion).{" "}
        <code>&lt;AnimatePresence mode=&quot;wait&quot;&gt;</code> wraps a
        single page-level <code>motion.div</code> keyed by an{" "}
        <code>exitToken</code> counter bumped inside{" "}
        <code>useRouteExit</code>. The Promise the router awaits resolves on{" "}
        <code>onExitComplete</code> — URL and UI stay in lock-step like the
        other three examples. Hero morph through <code>layoutId</code> and
        list reorder through <code>&lt;motion.li layout&gt;</code> are{" "}
        <strong>library-native</strong> — what <code>route-animations/</code>{" "}
        implements in ~340 LOC of manual <code>getBoundingClientRect</code> +
        WAAPI bookkeeping is a single prop here.
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
          Cross-browser, hero morph, list FLIP, gesture support, willing to pull
          in a library, want library-native primitives over hand-rolled
          policies? → <code>motion-animations/</code> (this).
        </li>
      </ul>

      <h2>What this example demonstrates uniquely</h2>
      <p>
        <strong>
          Library-native ergonomics with router-coordinated semantics
        </strong>
        : hero morph (<code>layoutId</code>) and list reorder (
        <code>&lt;motion.li layout&gt;</code>) are declarative props on inner
        elements, not procedural code in a coordinator module. The router stays
        blocked on the page-level exit Promise (resolved by{" "}
        <code>onExitComplete</code>), so URL and UI stay in lock-step — same
        semantics as <code>route-animations/</code> and{" "}
        <code>page-animations/</code>, but the choreography is expressed through
        library primitives instead of hand-rolled FLIP / ghost cloning code.
      </p>

      <h2>The wiring</h2>
      <p>
        See <code>src/main.tsx</code>, <code>src/App.tsx</code>, and{" "}
        <code>src/use-route-exit-coordination.ts</code>. <code>main.tsx</code>{" "}
        wraps <code>RouterProvider</code> in{" "}
        <code>&lt;MotionConfig reducedMotion=&quot;user&quot;&gt;</code> for
        application-wide accessibility respect.{" "}
        <code>useRouteExitCoordination()</code> bridges the leave-window
        with <code>&lt;AnimatePresence onExitComplete&gt;</code>: it calls{" "}
        <code>useRouteExit</code> from <code>@real-router/react</code> with
        a handler that bumps an <code>exitToken</code> (triggering
        AnimatePresence&apos;s exit on the cached old subtree) and returns
        a Promise resolved when motion fires <code>onExitComplete</code>.
        The abort signal from <code>useRouteExit</code> resolves the same
        Promise on rapid navigation, so the router pipeline drains cleanly
        — no exit-token-counter bookkeeping. Entry animations are
        declarative — the <code>initial</code> / <code>animate</code> props
        on <code>motion.div</code> in <code>App.tsx</code>; no hook
        involvement needed because motion handles mount-time animation
        natively.
      </p>
    </div>
  );
}
