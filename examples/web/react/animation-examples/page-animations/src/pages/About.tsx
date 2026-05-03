import { useRef } from "react";

import { useRouteAnimation } from "../use-route-animation";

import type { JSX } from "react";

export function About(): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);

  useRouteAnimation(ref, { entryClass: "fade-in", exitClass: "fade-out" });

  return (
    <div ref={ref}>
      <h1>Three approaches, side by side</h1>
      <p>
        This monorepo ships three first-class examples of router-coordinated
        animations. They cover overlapping ground but emphasise different
        trade-offs.
      </p>

      <h2>view-transitions/</h2>
      <p>
        Browser-driven via the <code>document.startViewTransition</code> API.
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
        <code>@real-router/react</code> with its own DOM recipe. Cross-route
        coordination (hero rect capture, list FLIP, ghost clones) works because
        state lives in module-level refs inside the hooks. Pages stay
        declarative — they only mark <code>[data-route-root]</code> /{" "}
        <code>[data-flip-key]</code> attributes; the hooks find them via DOM
        queries.
      </p>

      <h2>page-animations/ (this example)</h2>
      <p>
        Distributed via <code>useRouteAnimation(ref, …)</code> per page. Each
        page subscribes to the router for its own lifetime; no central module.
        Encapsulated, simpler mental model, less boilerplate per new page after
        the hook is in place. The trade-off: each component instance only sees
        its own lifecycle. Hero morph between routes needs shared state because
        the source rect is captured in page A but the destination is in page B.
        Same for list FLIP with ghost exits — survivors live in the new
        page&apos;s DOM, ghosts live nowhere unless something orchestrates them
        centrally.
      </p>

      <h2>motion-animations/</h2>
      <p>
        Router-coordinated via <code>motion</code> (formerly Framer Motion).{" "}
        <code>&lt;AnimatePresence mode=&quot;wait&quot;&gt;</code> is keyed by
        an <code>exitToken</code> counter bumped inside{" "}
        <code>useRouteExit</code>; the Promise the router awaits resolves on{" "}
        <code>onExitComplete</code>. Same URL-and-UI lock-step semantics as the
        other three. Hero morph through <code>layoutId</code> and list reorder
        through <code>&lt;motion.li layout&gt;</code> are{" "}
        <strong>library-native</strong> — declarative props rather than
        procedural code. Trade-off: ~50 KB extra in bundle.
      </p>

      <h2>Decision tree</h2>
      <ul>
        <li>
          Hero morph or persistent-shell static regions, modern browsers? →{" "}
          <code>view-transitions/</code>.
        </li>
        <li>
          Cross-browser, custom timing per route, hero morph, <em>and</em> list
          FLIP with ghosts? → <code>route-animations/</code>.
        </li>
        <li>
          Cross-browser, simple entry / exit per page, no hero morph, no
          coordinated reorder? → <code>page-animations/</code> (this).
        </li>
        <li>
          Cross-browser, hero morph + list FLIP via library primitives, willing
          to add a 50 KB dependency for declarative ergonomics? →{" "}
          <code>motion-animations/</code>.
        </li>
      </ul>

      <h2>The hook</h2>
      <p>
        See <code>src/use-route-animation.ts</code> (~120 LOC).{" "}
        <code>useRouteExit</code> from <code>@real-router/react</code> wraps{" "}
        <code>subscribeLeave</code> with abort/skip-same-route guards; the
        handler awaits <code>Element.getAnimations() + .finished</code>{" "}
        (reduced-motion fast-path: <code>allSettled([])</code> resolves
        synchronously). Entry plays on nav-driven mount via{" "}
        <code>useRouteEnter</code> from the same package — skip-initial and
        StrictMode double-mount immunity built in.
      </p>
    </div>
  );
}
