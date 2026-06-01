import { Link } from "@real-router/react";

import type { JSX } from "react";

/**
 * Short landing page. Used as a starting point for forward navigation —
 * any push from `/` lands on a long page with `scrollY === 0`. Hosts a
 * cross-path `<Link hash>` for Scenario 3b.
 */
export function Home(): JSX.Element {
  return (
    <div className="long-page">
      <h1>Scroll Restoration — feature demo</h1>
      <p>
        This example exercises every behavioral branch of{" "}
        <code>createScrollRestoration</code> (#497). Navigate around to see how
        scroll position is captured, restored, or reset depending on the
        navigation type and the configured mode.
      </p>
      <p>
        Watch the <strong>Scroll Meter</strong> in the bottom-right corner — it
        shows live <code>scrollY</code>, the published{" "}
        <code>state.context.navigation</code> direction / navigationType, and
        the <code>sessionStorage</code> store keyed by{" "}
        <code>{`name:canonicalJson(params)`}</code>.
      </p>

      <h2>Try these flows</h2>
      <ul>
        <li>
          Open <Link routeName="articles">Articles</Link>, scroll down, click
          any card, then Back — position is restored (Scenario 1).
        </li>
        <li>
          From here, click{" "}
          <Link
            routeName="docs"
            hash="installation"
            data-testid="link-docs-installation"
          >
            Docs §Installation
          </Link>{" "}
          — cross-path push preserves the hash and scrolls to the anchor
          (Scenario 3b, after #532).
        </li>
        <li>
          Go to <Link routeName="settings">Settings</Link> to switch{" "}
          <code>mode: restore | top | native</code> (Scenario 5).
        </li>
        <li>
          Open <Link routeName="gallery">Gallery</Link> — a virtual scroller
          inside a sized <code>&lt;div&gt;</code> (Scenario 6).
        </li>
        <li>
          Edge case:{" "}
          <Link
            routeName="docs"
            hash="no-such-section"
            data-testid="link-docs-missing"
          >
            Docs §missing
          </Link>{" "}
          — hash with no matching <code>id</code>; utility falls through to{" "}
          <code>writePos(0)</code> (Scenario 5i).
        </li>
      </ul>
    </div>
  );
}
