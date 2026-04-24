import type { JSX } from "react";

export function About(): JSX.Element {
  return (
    <div>
      <h1>About</h1>
      <p>
        This example uses <code>@real-router/react</code> with the{" "}
        <code>viewTransitions</code> prop on <code>RouterProvider</code>. The
        utility lives in <code>shared/dom-utils/view-transitions.ts</code> and
        uses only the public <code>subscribeLeave</code> + <code>subscribe</code>{" "}
        router API.
      </p>
      <p>
        <strong>How the timing works:</strong>
      </p>
      <ol>
        <li>
          <code>subscribeLeave</code> fires at the LEAVE_APPROVED phase —
          utility opens <code>document.startViewTransition(asyncCb)</code>. The
          VT synchronously snapshots the current (old) DOM.
        </li>
        <li>
          Listener returns <code>undefined</code> — router is NOT blocked,
          pipeline continues with activation guards and commit.
        </li>
        <li>
          <code>subscribe</code> fires at TRANSITION_SUCCESS — utility
          schedules a <code>requestAnimationFrame</code> and resolves the
          deferred. rAF gives React time to commit the new DOM.
        </li>
        <li>
          After rAF, VT snapshots the new DOM and animates the difference.
        </li>
      </ol>
      <p>
        The whole recipe is ~30 LOC. See{" "}
        <code>shared/dom-utils/view-transitions.ts</code> for the source.
      </p>
    </div>
  );
}
