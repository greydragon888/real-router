import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, it, expect } from "vitest";

import {
  HttpStatusCode,
  HttpStatusProvider,
  createHttpStatusSink,
} from "@real-router/react/ssr";

describe("createHttpStatusSink", () => {
  it("starts with code === undefined", () => {
    const sink = createHttpStatusSink();

    expect(sink.code).toBeUndefined();
  });

  it("returns a fresh sink per call (no shared mutable state)", () => {
    const a = createHttpStatusSink();
    const b = createHttpStatusSink();

    a.code = 404;

    expect(b.code).toBeUndefined();
  });
});

describe("HttpStatusCode", () => {
  describe("SSR (renderToString)", () => {
    it("writes the code to the provider's sink during render", () => {
      const sink = createHttpStatusSink();

      const view = renderToString(
        <HttpStatusProvider sink={sink}>
          <HttpStatusCode code={404} />
        </HttpStatusProvider>,
      );

      expect(sink.code).toBe(404);
      expect(view).toBe("");
    });

    it("renders nothing — empty HTML output", () => {
      const sink = createHttpStatusSink();

      const view = renderToString(
        <HttpStatusProvider sink={sink}>
          <div data-testid="content">
            <HttpStatusCode code={410} />
            <p>Hello</p>
          </div>
        </HttpStatusProvider>,
      );

      expect(view).toContain("Hello");
      expect(view).not.toContain("410");
    });

    it("last write wins with multiple instances in render order", () => {
      const sink = createHttpStatusSink();

      renderToString(
        <HttpStatusProvider sink={sink}>
          <HttpStatusCode code={404} />
          <HttpStatusCode code={410} />
          <HttpStatusCode code={503} />
        </HttpStatusProvider>,
      );

      expect(sink.code).toBe(503);
    });

    it("no-op without provider (safe to render anywhere)", () => {
      expect(() => renderToString(<HttpStatusCode code={404} />)).not.toThrow();
    });

    it("non-404 codes (410 Gone, 451 Unavailable for Legal Reasons) round-trip", () => {
      const sink = createHttpStatusSink();

      renderToString(
        <HttpStatusProvider sink={sink}>
          <HttpStatusCode code={451} />
        </HttpStatusProvider>,
      );

      expect(sink.code).toBe(451);
    });
  });

  describe("client (no provider — typical post-hydration)", () => {
    it("renders without throwing and writes nothing observable", () => {
      const { container } = render(<HttpStatusCode code={404} />);

      expect(container.innerHTML).toBe("");
    });

    it("with provider on client also writes (provider is symmetric)", () => {
      const sink = createHttpStatusSink();

      render(
        <HttpStatusProvider sink={sink}>
          <HttpStatusCode code={418} />
        </HttpStatusProvider>,
      );

      expect(sink.code).toBe(418);
    });
  });

  describe("HttpStatusProvider", () => {
    it("renders children verbatim", () => {
      const sink = createHttpStatusSink();

      render(
        <HttpStatusProvider sink={sink}>
          <span>visible content</span>
        </HttpStatusProvider>,
      );

      expect(screen.getByText("visible content")).toBeInTheDocument();
    });

    it("nested providers — inner sink wins (closest provider)", () => {
      const outer = createHttpStatusSink();
      const inner = createHttpStatusSink();

      renderToString(
        <HttpStatusProvider sink={outer}>
          <HttpStatusProvider sink={inner}>
            <HttpStatusCode code={404} />
          </HttpStatusProvider>
        </HttpStatusProvider>,
      );

      expect(inner.code).toBe(404);
      expect(outer.code).toBeUndefined();
    });
  });
});
