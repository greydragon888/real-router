import { act, render, screen, waitFor } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";

import { ClientOnly } from "@real-router/react/ssr";

import type { Root } from "react-dom/client";

describe("ClientOnly", () => {
  describe("SSR (renderToString)", () => {
    it("renders fallback on the server", () => {
      const view = renderToString(
        <ClientOnly fallback={<span data-testid="fallback">loading</span>}>
          <span data-testid="children">client content</span>
        </ClientOnly>,
      );

      expect(view).toContain("loading");
      expect(view).not.toContain("client content");
    });

    it("renders nothing when no fallback is provided", () => {
      const view = renderToString(
        <ClientOnly>
          <span data-testid="children">client content</span>
        </ClientOnly>,
      );

      expect(view).not.toContain("client content");
    });
  });

  describe("client (after mount)", () => {
    it("renders children after mount", async () => {
      render(
        <ClientOnly fallback={<span data-testid="fallback">loading</span>}>
          <span data-testid="children">client content</span>
        </ClientOnly>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("children")).toBeInTheDocument();
      });

      expect(screen.queryByTestId("fallback")).not.toBeInTheDocument();
    });

    it("renders nothing initially when no fallback (post-mount shows children)", async () => {
      render(
        <ClientOnly>
          <span data-testid="children">client content</span>
        </ClientOnly>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("children")).toBeInTheDocument();
      });
    });

    it("supports complex children (Fragment, multiple nodes)", async () => {
      render(
        <ClientOnly>
          <span data-testid="a">A</span>
          <span data-testid="b">B</span>
        </ClientOnly>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("a")).toBeInTheDocument();
        expect(screen.getByTestId("b")).toBeInTheDocument();
      });
    });
  });

  describe("hydration (renderToString → hydrateRoot)", () => {
    it("hydrates without mismatch warnings, then swaps to children", async () => {
      const errSpy = vi.spyOn(console, "error");
      const tree = (
        <ClientOnly fallback={<span data-testid="fallback">loading</span>}>
          <span data-testid="children">client content</span>
        </ClientOnly>
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
        expect(screen.getByTestId("children")).toBeInTheDocument();
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
