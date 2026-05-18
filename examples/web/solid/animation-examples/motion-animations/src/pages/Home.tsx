import type { JSX } from "solid-js";

export function Home(): JSX.Element {
  return (
    <div>
      <h1>Motion Animations</h1>
      <p>
        Router-coordinated recipe via{" "}
        <a href="https://github.com/solidjs-community/solid-motionone">
          <code>solid-motionone</code>
        </a>{" "}
        — Solid bindings around <a href="https://motion.dev">Motion One</a>.{" "}
        <code>&lt;Presence exitBeforeEnter&gt;</code> in <code>App.tsx</code>{" "}
        wraps a single page-level <code>&lt;Motion.div&gt;</code> keyed by an{" "}
        <code>exitToken</code> counter bumped inside <code>useRouteExit</code>{" "}
        (from <code>@real-router/solid</code>); Presence detects the keyed
        re-instantiation and starts exit. The router blocks on a Promise that
        resolves when the exiting Motion element fires{" "}
        <code>onMotionComplete</code> — URL and UI stay in lock-step, same
        semantics as the other three examples.
      </p>

      <h2>Scenarios to try</h2>
      <ol>
        <li>
          <strong>Cross-route fade + slide</strong>: click <em>About</em>. The
          page-level <code>Motion.div</code> fades / slides out (
          <code>exit=&#123;{`{ opacity: 0, x: -20 }`}&#125;</code>), the new one
          slides in. <code>Presence exitBeforeEnter</code> guarantees
          sequential, not crossfade.
        </li>
        <li>
          <strong>Skip on initial</strong>: reload this page — the heading is
          visible immediately.{" "}
          <code>{`<Show when={exitToken() + 1} keyed>`}</code> renders the first
          Motion.div with{" "}
          <code>initial=&#123;{`{ opacity: 0, x: 20 }`}&#125;</code> →{" "}
          <code>animate=&#123;{`{ opacity: 1, x: 0 }`}&#125;</code>; the enter
          plays once on mount, then nothing fires until a navigation.
        </li>
        <li>
          <strong>Skip same-route</strong>: click <em>Home</em> while on Home —
          the router rejects with <code>SAME_STATES</code> before re-render;{" "}
          <code>exitToken</code> is not bumped so Presence is not triggered.
        </li>
        <li>
          <strong>Reduced motion</strong>: with{" "}
          <code>prefers-reduced-motion: reduce</code>, Motion One automatically
          suppresses transform and opacity animations driven by browser-level
          CSS preferences.
        </li>
        <li>
          <strong>Abort safety (rapid clicks)</strong>: click sidebar links
          rapid-fire — <code>exitBeforeEnter</code> queues exits; intermediate
          routes' entrances are skipped if a newer navigation arrives before
          they mount.
        </li>
      </ol>

      <h2>Differences from motion-react</h2>
      <p>
        <code>solid-motionone</code> wraps the framework-agnostic{" "}
        <a href="https://motion.dev">Motion One</a> engine — the same engine
        that powers motion-react under the hood. The Solid bindings are tiny by
        design: <code>Motion</code> components, <code>Presence</code>, lifecycle
        event handlers (<code>onMotionStart</code>,{" "}
        <code>onMotionComplete</code>). The library does <strong>not</strong>{" "}
        ship motion-react's layout-animation primitives:
      </p>
      <ul>
        <li>
          No <code>layoutId</code> for cross-component hero morphs — paired rect
          transitions across route boundaries are not built in.
        </li>
        <li>
          No <code>&lt;Motion.li layout&gt;</code> for automatic list reorder —
          sort changes do not animate by themselves.
        </li>
      </ul>
      <p>
        For those scenarios in Solid, the hand-rolled WAAPI approach from{" "}
        <code>route-animations/</code> (<code>useHeroMorph</code>,{" "}
        <code>useListFlip</code>) is the cross-browser, library-free path.
      </p>

      <p>
        See <em>About</em> for the side-by-side comparison with all four
        approaches and when each is the right call.
      </p>
    </div>
  );
}
