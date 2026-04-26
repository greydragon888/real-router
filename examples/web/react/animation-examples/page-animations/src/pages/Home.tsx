import { useRef } from "react";

import { useRouteAnimation } from "../use-route-animation";

import type { JSX } from "react";

export function Home(): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);

  useRouteAnimation(ref, { entryClass: "fade-in", exitClass: "fade-out" });

  return (
    <div ref={ref}>
      <h1>Page Animations</h1>
      <p>
        Distributed per-page recipe: each page calls{" "}
        <code>useRouteAnimation(ref, …)</code> in its own component, which
        subscribes to <code>router.subscribeLeave</code> /{" "}
        <code>router.subscribe</code> for the lifetime of the page. No
        centralised policy module — animation logic lives next to the page that
        owns it.
      </p>

      <h2>Scenarios to try</h2>
      <ol>
        <li>
          <strong>Cross-route fade</strong>: click <em>About</em>. Home&apos;s{" "}
          <code>fade-out</code> class runs, the hook&apos;s Promise resolves on{" "}
          <code>animationend</code>, the router activates About, and
          About&apos;s <code>fade-in</code> plays via its own{" "}
          <code>useRouteAnimation</code>.
        </li>
        <li>
          <strong>Per-page customisation</strong>: each page picks its own class
          names. <em>Products</em> uses <code>slide-out</code> /{" "}
          <code>slide-in</code> for a horizontal slide; everything else fades.
          The hook is route-agnostic — pages choose semantics.
        </li>
        <li>
          <strong>Sequential timing</strong>: same as the centralised recipe —{" "}
          <code>subscribeLeave</code> returns a Promise, so the router blocks
          until the exit animation completes before the next page mounts.
        </li>
        <li>
          <strong>Skip same-route</strong>: open <em>Query demo</em> and switch
          filter. The hook&apos;s <code>skipSameRoute: true</code> (default)
          detects <code>route.name === nextRoute.name</code> and returns
          synchronously — no leave / entry flash on each filter click.
        </li>
        <li>
          <strong>Reduced motion</strong>: with{" "}
          <code>prefers-reduced-motion: reduce</code> the keyframes collapse to{" "}
          <code>animation: none</code>. <code>animationend</code> never fires;
          the hook&apos;s 50 ms timeout fallback releases the router.
        </li>
      </ol>

      <h2>What this approach gives up</h2>
      <p>
        See <em>About</em> for the full comparison with{" "}
        <code>view-transitions/</code> and <code>route-animations/</code>. The
        short version: distributed per-page hooks cover entry + exit cleanly,
        but cross-page coordination (hero morph between routes, list FLIP with
        ghost exits) needs shared state — module-level variables, Context, or a
        custom event bus — because each page&apos;s hook only sees its own
        lifecycle.
      </p>
    </div>
  );
}
