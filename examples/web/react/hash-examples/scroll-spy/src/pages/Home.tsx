import { Link } from "@real-router/react";

import type { JSX } from "react";

interface HomeProps {
  readonly pluginKind: "browser" | "navigation";
  readonly spyMode: "provider" | "per-route";
}

export function Home({ pluginKind, spyMode }: HomeProps): JSX.Element {
  return (
    <article className="article home" data-testid="home">
      <h1>Real-Router Scroll Spy — React example</h1>
      <p>
        Active URL plugin: <strong>{pluginKind}-plugin</strong>. Active spy
        mode: <strong>{spyMode}</strong>.
      </p>
      <h2>Modes</h2>
      <ul>
        <li>
          <Link routeName="home" routeOptions={{ replace: true }}>
            ?plugin=navigation (default)
          </Link>{" "}
          — Navigation API; richer signals (direction/traverse) on{" "}
          <code>state.context.navigation</code>.
        </li>
        <li>
          <a href="?plugin=browser">?plugin=browser</a> — History API; portable{" "}
          <code>state.transition.replace</code> is the only signal scroll-spy
          and scroll-restoration coordinate on (foundation RFC §10.7).
        </li>
        <li>
          <a href="?spy=per-route">?spy=per-route</a> — per-route different
          selector; <code>/article</code> emits all h2/h3, <code>/guide</code>{" "}
          excludes <code>.no-spy</code>, <code>/about</code> has no spy at all.
        </li>
      </ul>
      <h2>Try</h2>
      <ul>
        <li>
          <Link routeName="article">/article</Link> — 12 sections; URL hash
          tracks topmost h2 as you scroll. Click any TOC item — URL goes
          directly there, no flicker through intermediate sections.
        </li>
        <li>
          <Link routeName="guide">/guide</Link> — secondary scrolly route.
        </li>
        <li>
          <Link routeName="about">/about</Link> — no anchors; URL hash is
          preserved.
        </li>
      </ul>
    </article>
  );
}
