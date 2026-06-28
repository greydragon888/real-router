import { link } from "@real-router/solid";

import type { JSX } from "solid-js";

// Keep reference to prevent tree-shaking (Solid directive pattern)
// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- Solid directive use:link is detected at compile time but reads as unused at runtime
link;

export function Settings(): JSX.Element {
  return (
    <div>
      <h1>Settings</h1>
      <p>
        You navigated here via <code>use:link</code> directive.
      </p>
      <div class="card">
        <p>
          The directive automatically adds <code>role="link"</code> and{" "}
          <code>tabindex="0"</code> to non-interactive elements for
          accessibility.
        </p>
      </div>
      <a use:link={{ routeName: "home" }}>← Back to Home</a>
    </div>
  );
}
