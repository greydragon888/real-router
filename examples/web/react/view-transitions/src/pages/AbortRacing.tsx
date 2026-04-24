import { Link } from "@real-router/react";

import type { JSX } from "react";

export function AbortRacing(): JSX.Element {
  return (
    <div>
      <h1>Abort safety</h1>
      <p>
        Click these links as fast as you can. real-router cancels older
        in-flight navigations, and <code>createViewTransitions</code> cleans
        up via the <code>AbortSignal</code> on <code>LeaveState</code> — only
        the last transition completes; the others are skipped.
      </p>
      <div className="vt-abort-grid">
        <Link routeName="home">Home</Link>
        <Link routeName="products">Products</Link>
        <Link routeName="about">About</Link>
        <Link routeName="queryDemo">Query demo</Link>
        <Link routeName="reducedMotion">Reduced motion</Link>
      </div>
      <p>
        Watch <code>document.getAnimations()</code> in devtools — rapid clicks
        leave exactly one active animation, even across 5+ rapid nav calls.
      </p>
    </div>
  );
}
