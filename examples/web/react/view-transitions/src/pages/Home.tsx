import type { JSX } from "react";

export function Home(): JSX.Element {
  return (
    <div>
      <h1>View Transitions</h1>
      <p>
        This example demonstrates browser&apos;s View Transitions API
        integration with real-router via a single <code>viewTransitions</code>{" "}
        prop on <code>RouterProvider</code>.
      </p>
      <h2>Nine scenarios to try</h2>
      <ol>
        <li>
          <strong>Basic</strong>: click any sidebar link — default crossfade
          animates between routes.
        </li>
        <li>
          <strong>Skip on initial</strong>: reload this page — no animation on
          first mount.
        </li>
        <li>
          <strong>Skip same-route</strong>: click <em>Home</em> while already on
          Home — nothing animates.
        </li>
        <li>
          <strong>Per-area / query-only</strong>: open <em>Query demo</em>,
          change the filter; only the scoped container animates.
        </li>
        <li>
          <strong>Hero morph</strong>: open <em>Products</em>, click a product
          card — the thumbnail smoothly morphs into the detail cover.
        </li>
        <li>
          <strong>Feature fallback</strong>: the utility auto-detects support —
          no-op on Firefox without View Transitions.
        </li>
        <li>
          <strong>Reduced motion</strong>: set your OS to reduce motion; VT
          runs but with zero-duration animations.
        </li>
        <li>
          <strong>Abort safety</strong>: open <em>Abort racing</em>, click
          rapid-fire — older transitions are skipped, last one wins.
        </li>
        <li>
          <strong>Direction-aware</strong>: use browser back/forward — the
          animation direction flips via the <code>data-nav-direction</code>{" "}
          attribute on <code>&lt;html&gt;</code>.
        </li>
      </ol>
      <p>
        The entire integration is one prop:{" "}
        <code>&lt;RouterProvider viewTransitions&gt;</code>. Customization
        happens in CSS via <code>::view-transition-*</code> pseudo-elements.
      </p>
    </div>
  );
}
