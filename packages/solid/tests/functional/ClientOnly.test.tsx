import { render, screen, waitFor } from "@solidjs/testing-library";
import { describe, it, expect } from "vitest";

import { ClientOnly } from "@real-router/solid/ssr";

describe("ClientOnly", () => {
  // §4.2 audit note (onMount SSR-safe): a `renderToString` unit test would
  // be the most direct way to lock the "fallback-during-SSR" branch — Solid
  // guarantees `onMount` never fires during server render. The test was
  // attempted but pulled out: vitest's default jsdom + solid-js builds
  // compile to the client codegen path (no SSR generate), so
  // `renderToString` returns `undefined` instead of an HTML string. The
  // proper coverage lives at the e2e layer (`examples/web/solid/ssr-examples/ssr/`),
  // which uses vite-plugin-solid({ ssr: true }) to swap to the SSR codegen.
  // Adding a dedicated SSR vitest project just for this contract is more
  // surface than the marginal regression risk justifies.

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
