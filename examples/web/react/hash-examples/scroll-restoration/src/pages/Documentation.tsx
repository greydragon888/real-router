import { Link } from "@real-router/react";

import type { JSX } from "react";

/**
 * Long page with anchor headings — exercises Scenario 3 (4 sub-tests):
 * - 3a: page.goto('/docs#getting-started') initial entry with anchor
 * - 3b: cross-path <Link hash> from / lands on /docs#installation
 * - 3c: same-path <Link hash> on /docs#api → /docs#examples auto-force
 * - 3d: cyrillic id /docs#секция-5 (percent-encoded in URL bar, decoded
 *       by URL plugin into state.context.url.hash)
 *
 * After #531/#532 anchor scrolling works in both restore and top modes,
 * across all four entry points. Each section is intentionally tall (~600px)
 * so scroll position is unambiguous in e2e.
 */

const sections = [
  { id: "getting-started", title: "Getting Started" },
  { id: "installation", title: "Installation" },
  { id: "configuration", title: "Configuration" },
  { id: "api", title: "API Reference" },
  { id: "examples", title: "Examples" },
  { id: "troubleshooting", title: "Troubleshooting" },
  { id: "section-5", title: "Section 5 (ASCII anchor)" },
  { id: "секция-5", title: "Секция-5 (Cyrillic anchor)" },
];

const PARAGRAPH = `
  Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod
  tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim
  veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea
  commodo consequat. Duis aute irure dolor in reprehenderit in voluptate
  velit esse cillum dolore eu fugiat nulla pariatur.
`.trim();

export function Documentation(): JSX.Element {
  return (
    <div className="long-page">
      <h1>Documentation</h1>
      <p>
        Long page with anchor sections. Anchor scroll works after #531/#532 in{" "}
        <em>all</em> entry points: initial goto, cross-path{" "}
        <code>&lt;Link hash&gt;</code>, same-path <code>&lt;Link hash&gt;</code>{" "}
        (auto-force via <code>navigateWithHash</code>), and cyrillic ids
        (decoded by URL plugin).
      </p>

      <nav className="docs-toc" aria-label="table of contents">
        <h3>On this page</h3>
        <ul>
          {sections.map((section) => (
            <li key={section.id}>
              <Link
                routeName="docs"
                hash={section.id}
                data-testid={`toc-${section.id}`}
              >
                {section.title}
              </Link>
            </li>
          ))}
          <li>
            <Link
              routeName="docs"
              hash="no-such-section"
              data-testid="toc-missing"
            >
              (broken anchor — no matching id)
            </Link>
          </li>
        </ul>
      </nav>

      {sections.map((section) => (
        <section key={section.id}>
          <h2 id={section.id}>{section.title}</h2>
          <p>{PARAGRAPH}</p>
          <p>{PARAGRAPH}</p>
          <p>{PARAGRAPH}</p>
          <p>{PARAGRAPH}</p>
        </section>
      ))}
    </div>
  );
}
