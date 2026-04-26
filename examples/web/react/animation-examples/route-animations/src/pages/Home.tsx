import type { JSX } from "react";

export function Home(): JSX.Element {
  return (
    <div data-route-root data-route-anim="fade" data-route-scope="home">
      <h1>Route Animations</h1>
      <p>
        This example animates route changes via CSS <code>@keyframes</code> and
        an async <code>subscribeLeave</code> listener — no View Transitions API.
        The recipe is ~30 LOC of policy plus ~150 lines of CSS, works in every
        modern browser including Firefox without VT, and gives you per-route
        timing control out of the box.
      </p>

      <h2>Scenarios to try</h2>
      <ol>
        <li>
          <strong>Per-route timing</strong>: click <em>About</em> (900 ms fade),
          then click <em>Products</em> (2100 ms slide). Each route picks its own
          animation via <code>data-route-anim</code> on its{" "}
          <code>[data-route-root]</code> wrapper.
        </li>
        <li>
          <strong>Sequential, not parallel</strong>: <code>subscribeLeave</code>{" "}
          returns a Promise, so the router blocks until{" "}
          <code>animationend</code> fires. Exit fully completes <em>before</em>{" "}
          the next page mounts — no crossfade, no overlap. View Transitions
          gives you crossfade for free; the recipe gives you sequencing for
          free.
        </li>
        <li>
          <strong>Direction-aware slide</strong>: navigate to <em>Products</em>{" "}
          (forward — slide-from-right), then use the browser back button (back —
          slide-from-left). <code>data-nav-direction</code> on{" "}
          <code>&lt;html&gt;</code> is flipped from a popstate listener.
        </li>
        <li>
          <strong>Skip on initial</strong>: reload this page — no animation on
          first mount. <code>router.start()</code> does not fire{" "}
          <code>subscribeLeave</code>.
        </li>
        <li>
          <strong>Skip same-route</strong>: click <em>Home</em> while already on
          Home — the router rejects with <code>SAME_STATES</code> and the
          listener never runs.
        </li>
        <li>
          <strong>Query-only suppression + list FLIP</strong>: open{" "}
          <em>Products</em> and switch sort (A → Z / Z → A) — the page itself
          does not fade (policy detects{" "}
          <code>route.name === nextRoute.name</code> and skips the leave
          marker), but each card glides to its new position. On{" "}
          <em>Query demo</em>: survivors translate, newly-visible items fade in,
          and items dropped by a narrowing filter fade out via{" "}
          <code>cloneNode</code> ghosts pinned at the captured rect (React
          unmounts the originals before subscribe fires).
        </li>
        <li>
          <strong>Hero morph (manual FLIP)</strong>: open <em>Products</em>,
          click a product card. The thumbnail&apos;s rect is captured before
          leave; after the detail page mounts, an inverse-FLIP transform plays
          via the Web Animations API. Costs ~30 lines of policy code that VT
          gives you for free via <code>view-transition-name</code> pairing.
        </li>
        <li>
          <strong>Abort safety</strong>: click sidebar links rapid-fire — the{" "}
          <code>AbortSignal</code> from <code>LeaveState</code> removes{" "}
          <code>data-leaving</code> from cancelled exits, no animation leaks.
        </li>
        <li>
          <strong>Reduced motion</strong>: set your OS to reduce motion —{" "}
          <code>animation: none</code> via media query collapses the keyframe.{" "}
          <code>animationend</code> never fires; a 50 ms{" "}
          <code>Promise.race</code> fallback in <code>animateExit()</code>{" "}
          unblocks the router.
        </li>
        <li>
          <strong>Cross-browser</strong>: works identically in Firefox without{" "}
          <code>document.startViewTransition</code>. The parallel{" "}
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
  );
}
