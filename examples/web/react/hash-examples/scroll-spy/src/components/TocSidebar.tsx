import { Link } from "@real-router/react";

import { SECTIONS } from "../pages/article-sections";

import type { JSX } from "react";

export function TocSidebar(): JSX.Element {
  return (
    <nav aria-label="Table of contents" className="toc" data-testid="toc">
      <h3 className="toc__title">Contents</h3>
      <ol className="toc__list">
        {SECTIONS.map((section) => (
          <li key={section.id} className="toc__item">
            <Link
              routeName="article"
              hash={section.id}
              activeClassName="toc__link--active"
              data-testid={`toc-${section.id}`}
            >
              {section.title}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
