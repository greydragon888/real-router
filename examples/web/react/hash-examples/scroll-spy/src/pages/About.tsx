import type { JSX } from "react";

export function About(): JSX.Element {
  return (
    <article className="article about" data-testid="about">
      <h1>About this example</h1>
      <p>
        This page has no <code>[id]</code> anchors. scroll-spy is active but
        finds no candidates → IO observe is empty → no emits → URL hash is
        preserved from the previous route.
      </p>
      <p>
        Under <code>?spy=per-route</code> the per-route logic returns no
        selector for <code>/about</code> — the spy is not created on this route
        at all.
      </p>
    </article>
  );
}
