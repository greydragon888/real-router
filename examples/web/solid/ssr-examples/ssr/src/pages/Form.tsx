import { createUniqueId } from "solid-js";

import type { JSX } from "solid-js";

// Demonstrates `createUniqueId()` — Solid's SSR-safe stable ID
// primitive. The same ID is generated on the server and on the client,
// so accessibility-related bindings (`<label htmlFor>`, `aria-controls`,
// `aria-labelledby`, `aria-describedby`) survive hydration without
// mismatch warnings. Without it, SSR + client-rendered IDs would diverge
// — the screen reader announcement would break or hydration would warn.
//
// Verified empirically by Scenario "createUniqueId":
//   1. Read the SSR'd HTML, capture id="..." values for label htmlFor +
//      input id + describedby.
//   2. Read the same values after hydration via the DOM.
//   3. Server-side IDs === client-side IDs (no mismatch).

export function Form(): JSX.Element {
  const emailId = createUniqueId();
  const emailHelpId = createUniqueId();
  const subscribeId = createUniqueId();

  return (
    <section data-testid="form-page">
      <h2>Subscribe</h2>
      <form>
        <p>
          <label for={emailId} data-testid="email-label">Email address</label>
          <input
            type="email"
            id={emailId}
            data-testid="email-input"
            aria-describedby={emailHelpId}
          />
          <span id={emailHelpId} data-testid="email-help">
            We'll never share your email.
          </span>
        </p>
        <p>
          <input type="checkbox" id={subscribeId} data-testid="subscribe-input" />
          <label for={subscribeId} data-testid="subscribe-label">
            Send me weekly updates
          </label>
        </p>
      </form>
    </section>
  );
}
