import { act, render, screen, waitFor } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";

import { ServerOnly } from "@real-router/react";

import type { Root } from "react-dom/client";

describe("ServerOnly", () => {
  describe("SSR (renderToString)", () => {
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

  describe("hydration (renderToString → hydrateRoot)", () => {
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

      let root!: Root;

      await act(async () => {
        root = hydrateRoot(mountPoint, tree);
      });

      await waitFor(() => {
        expect(screen.getByTestId("fallback")).toBeInTheDocument();
      });

      const hydrationErrors = errSpy.mock.calls.filter(
        ([msg]: readonly unknown[]) =>
          typeof msg === "string" && /hydrat/i.test(msg),
      );

      expect(hydrationErrors).toHaveLength(0);

      root.unmount();
      mountPoint.remove();
      errSpy.mockRestore();
    });
  });
});
