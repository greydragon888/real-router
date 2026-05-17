import { render, screen, waitFor } from "@solidjs/testing-library";
import { describe, it, expect } from "vitest";

import { ServerOnly } from "@real-router/solid/ssr";

describe("ServerOnly", () => {
  // §4.2 audit note (onMount SSR-safe, inverse): same reasoning as
  // ClientOnly.test.tsx — a `renderToString` unit test would lock the
  // "children-during-SSR" branch, but vitest's solid-js build path is
  // client-only and `renderToString` returns `undefined`. SSR coverage
  // lives in the e2e example app (vite-plugin-solid({ ssr: true })).

  it("renders fallback after mount when provided", async () => {
    render(() => (
      <ServerOnly fallback={<span data-testid="fallback">client view</span>}>
        <span data-testid="children">server content</span>
      </ServerOnly>
    ));

    await waitFor(() => {
      expect(screen.getByTestId("fallback")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("children")).not.toBeInTheDocument();
  });

  it("renders nothing after mount when no fallback (default)", async () => {
    // First wait for onMount to fire (anchor on a known onMount side-effect:
    // the children disappear together with onMount completing). Then assert
    // the negative once, statically — placing a negative-only check inside
    // waitFor makes the wait trivially pass on the first tick.
    const { container } = render(() => (
      <ServerOnly>
        <span data-testid="children">server content</span>
      </ServerOnly>
    ));

    await waitFor(() => {
      // The children prop is rendered SSR-side only; after mount it must be
      // dropped. Anchor the wait on the container becoming empty.
      expect(container.textContent).toBe("");
    });

    expect(screen.queryByTestId("children")).not.toBeInTheDocument();
  });
});
