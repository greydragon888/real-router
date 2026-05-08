import { render, screen, waitFor } from "@solidjs/testing-library";
import { describe, it, expect } from "vitest";

import { ServerOnly } from "@real-router/solid";

describe("ServerOnly", () => {
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
    render(() => (
      <ServerOnly>
        <span data-testid="children">server content</span>
      </ServerOnly>
    ));

    await waitFor(() => {
      expect(screen.queryByTestId("children")).not.toBeInTheDocument();
    });
  });
});
