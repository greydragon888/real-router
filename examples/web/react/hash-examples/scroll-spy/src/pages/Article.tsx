import { SECTIONS } from "./article-sections";
import { TocSidebar } from "../components/TocSidebar";

import type { JSX } from "react";

export function Article(): JSX.Element {
  return (
    <div className="article-layout">
      <TocSidebar />
      <article className="article" data-testid="article">
        <h1>How the Router Hash Channel Works</h1>
        {SECTIONS.map((section) => (
          <section key={section.id} className="article__section">
            <h2 id={section.id}>{section.title}</h2>
            <p>{section.body}</p>
            <p className="article__filler">
              {/* Filler to force ~80vh per section so IO fires deterministically */}
              {"Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(
                30,
              )}
            </p>
          </section>
        ))}
      </article>
    </div>
  );
}
