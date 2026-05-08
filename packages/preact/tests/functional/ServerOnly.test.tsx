import { render, screen, waitFor } from "@testing-library/preact";
import { hydrate } from "preact";
import { renderToString } from "preact-render-to-string";
import { describe, it, expect, vi } from "vitest";

import { ServerOnly } from "@real-router/preact";

describe("ServerOnly", () => {
  describe("SSR (preact-render-to-string)", () => {
    it("renders children on the server", () => {
      const view = renderToString(
        <ServerOnly fallback={<span data-testid="fallback">client view</span>}>
          <span data-testid="children">server content</span>
        </ServerOnly>,
      );

      expect(view).toContain("server content");
      expect(view).not.toContain("client view");
    });

    it("renders children when no fallback is provided", () => {
      const view = renderToString(
        <ServerOnly>
          <span data-testid="children">server content</span>
        </ServerOnly>,
      );

      expect(view).toContain("server content");
    });
  });

  describe("client (after mount)", () => {
    it("renders fallback after mount when provided", async () => {
      render(
        <ServerOnly fallback={<span data-testid="fallback">client view</span>}>
          <span data-testid="children">server content</span>
        </ServerOnly>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("fallback")).toBeInTheDocument();
      });

      expect(screen.queryByTestId("children")).not.toBeInTheDocument();
    });

    it("renders nothing after mount when no fallback (default)", async () => {
      render(
        <ServerOnly>
          <span data-testid="children">server content</span>
        </ServerOnly>,
      );

      await waitFor(() => {
        expect(screen.queryByTestId("children")).not.toBeInTheDocument();
      });
    });
  });

  describe("hydration (renderToString → hydrate)", () => {
    it("hydrates without mismatch warnings, then swaps to fallback", async () => {
      const errSpy = vi.spyOn(console, "error");
      const tree = (
        <ServerOnly fallback={<span data-testid="fallback">client view</span>}>
          <span data-testid="children">server content</span>
        </ServerOnly>
      );
      const view = renderToString(tree);
      const mountPoint = document.createElement("div");

      document.body.append(mountPoint);
      mountPoint.innerHTML = view;

      hydrate(tree, mountPoint);

      await waitFor(() => {
        expect(screen.getByTestId("fallback")).toBeInTheDocument();
      });

      const hydrationErrors = errSpy.mock.calls.filter(
        ([msg]: readonly unknown[]) =>
          typeof msg === "string" && /hydrat/i.test(msg),
      );

      expect(hydrationErrors).toHaveLength(0);

      mountPoint.remove();
      errSpy.mockRestore();
    });
  });
});
