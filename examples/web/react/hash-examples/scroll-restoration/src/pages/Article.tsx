import { Link, useRoute } from "@real-router/react";

import { ProgrammaticReloadDemo } from "../components/ProgrammaticReloadDemo";
import { ReplaceDemo } from "../components/ReplaceDemo";

import type { JSX } from "react";

/**
 * Article page — long body for scroll, plus ReplaceDemo (Scenario 4) and
 * ProgrammaticReloadDemo (Scenario 7c) embedded near the top so e2e can
 * scroll a known offset and click without hunting.
 */

const PARAGRAPH = `
  This is article content. The body is long enough that scrollY of 1500-2500
  is reachable without resizing the viewport. Replace navigation (button below)
  preserves your scroll position; programmatic reload restores from the
  sessionStorage scroll-restore store.
`.trim();

export function Article(): JSX.Element {
  const { route } = useRoute<{ id: string }>();
  const id = route.params.id;

  return (
    <div className="long-page">
      <h1>Article #{id}</h1>
      <p>
        <Link routeName="articles" data-testid="back-to-list">
          ← Back to list
        </Link>
      </p>

      <div data-testid="article-actions">
        <ReplaceDemo />
        <ProgrammaticReloadDemo />
      </div>

      {Array.from({ length: 30 }, (_, i) => (
        <p key={i}>
          §{i + 1}. {PARAGRAPH}
        </p>
      ))}
    </div>
  );
}
