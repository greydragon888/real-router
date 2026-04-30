import { Link } from "@real-router/react";

import type { JSX } from "react";

/**
 * Long list of article cards — primary restore + save scene (Scenario 1, 7).
 * 50 cards × ~120px = ~6000px page height, plenty of room to scroll past
 * 3000px and verify back-restore lands at the captured position.
 */

const ARTICLE_TITLES = [
  "Why we replaced Redux with router state",
  "Hash routing without breaking tab UIs",
  "Building a framework-agnostic router from scratch",
  "Scroll restoration: the parts nobody talks about",
  "Plugin architecture vs. monolithic routers",
  "Cross-document navigation with the Navigation API",
  "Type-safe URL parameters via TypeScript inference",
  "Memory routing for terminal UIs",
];

const EXCERPTS = [
  "Single source of truth for view state, deep linking comes for free.",
  "Anchor scroll without sacrificing tabbed interfaces — yes, you can.",
  "Six adapters, one core. Lessons from a year of decoupled routing.",
  "Save on pagehide, restore on traverse, and never trust history.scrollRestoration.",
  "Composable plugins beat hand-rolled middleware every time.",
  "Reload, traverse, push, replace — and how to tell them apart.",
  "Generics on hooks unlock auto-complete for params across the codebase.",
  "Keyboard-driven navigation works the same as the web — once you have a router.",
];

const articles = Array.from({ length: 50 }, (_, i) => ({
  id: String(i + 1),
  title: `${
    ARTICLE_TITLES[i % ARTICLE_TITLES.length]
  } — part ${Math.floor(i / 10) + 1}`,
  excerpt: `Article #${i + 1}. ${EXCERPTS[i % EXCERPTS.length]}`,
}));

export function Articles(): JSX.Element {
  return (
    <div>
      <h1 style={{ padding: "24px 24px 0" }}>Articles</h1>
      <p style={{ padding: "0 24px" }}>
        Long list — scroll down, click any card, then press the browser Back
        button. Position is restored (Scenario 1). F5 here saves the position
        via <code>pagehide</code> and restores it on the next load (Scenario 7
        after #531).
      </p>
      <div className="articles-list">
        {articles.map((article) => (
          <Link
            key={article.id}
            routeName="articles.article"
            routeParams={{ id: article.id }}
            data-testid={`article-card-${article.id}`}
            className="article-card"
          >
            <h3>{article.title}</h3>
            <p>{article.excerpt}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
