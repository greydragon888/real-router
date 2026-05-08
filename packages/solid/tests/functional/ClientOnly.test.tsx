import { render, screen, waitFor } from "@solidjs/testing-library";
import { describe, it, expect } from "vitest";

import { ClientOnly } from "@real-router/solid";

describe("ClientOnly", () => {
  it("renders children after mount", async () => {
    render(() => (
      <ClientOnly fallback={<span data-testid="fallback">loading</span>}>
        <span data-testid="children">client content</span>
      </ClientOnly>
    ));

    await waitFor(() => {
      expect(screen.getByTestId("children")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("fallback")).not.toBeInTheDocument();
  });

  it("renders children when no fallback is provided (post-mount)", async () => {
    render(() => (
      <ClientOnly>
        <span data-testid="children">client content</span>
      </ClientOnly>
    ));

    await waitFor(() => {
      expect(screen.getByTestId("children")).toBeInTheDocument();
    });
  });

  it("supports multiple children", async () => {
    render(() => (
      <ClientOnly>
        <span data-testid="a">A</span>
        <span data-testid="b">B</span>
      </ClientOnly>
    ));

    await waitFor(() => {
      expect(screen.getByTestId("a")).toBeInTheDocument();
      expect(screen.getByTestId("b")).toBeInTheDocument();
    });
  });
});
