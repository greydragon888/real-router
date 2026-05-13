import { render, screen } from "@solidjs/testing-library";
import { describe, it, expect } from "vitest";

import {
  HttpStatusCode,
  HttpStatusProvider,
  createHttpStatusSink,
} from "@real-router/solid/ssr";

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
  describe("with provider", () => {
    it("writes the code to the provider's sink during render", () => {
      const sink = createHttpStatusSink();

      const { container } = render(() => (
        <HttpStatusProvider sink={sink}>
          <HttpStatusCode code={404} />
        </HttpStatusProvider>
      ));

      expect(sink.code).toBe(404);
      expect(container.textContent).toBe("");
    });

    it("renders nothing — empty DOM output for the component", () => {
      const sink = createHttpStatusSink();

      render(() => (
        <HttpStatusProvider sink={sink}>
          <div data-testid="content">
            <HttpStatusCode code={410} />
            <p>Hello</p>
          </div>
        </HttpStatusProvider>
      ));

      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    it("last write wins with multiple instances in render order", () => {
      const sink = createHttpStatusSink();

      render(() => (
        <HttpStatusProvider sink={sink}>
          <HttpStatusCode code={404} />
          <HttpStatusCode code={410} />
          <HttpStatusCode code={503} />
        </HttpStatusProvider>
      ));

      expect(sink.code).toBe(503);
    });

    it("non-404 codes (410 Gone, 451 Unavailable for Legal Reasons) round-trip", () => {
      const sink = createHttpStatusSink();

      render(() => (
        <HttpStatusProvider sink={sink}>
          <HttpStatusCode code={451} />
        </HttpStatusProvider>
      ));

      expect(sink.code).toBe(451);
    });

    it("nested providers — inner sink wins (closest provider)", () => {
      const outer = createHttpStatusSink();
      const inner = createHttpStatusSink();

      render(() => (
        <HttpStatusProvider sink={outer}>
          <HttpStatusProvider sink={inner}>
            <HttpStatusCode code={404} />
          </HttpStatusProvider>
        </HttpStatusProvider>
      ));

      expect(inner.code).toBe(404);
      expect(outer.code).toBeUndefined();
    });
  });

  describe("without provider", () => {
    it("renders without throwing and writes nothing observable", () => {
      const { container } = render(() => <HttpStatusCode code={404} />);

      // No DOM output at all — not just no text.
      expect(container.innerHTML).toBe("");
    });
  });

  describe("HttpStatusProvider", () => {
    it("renders children verbatim", () => {
      const sink = createHttpStatusSink();

      render(() => (
        <HttpStatusProvider sink={sink}>
          <span>visible content</span>
        </HttpStatusProvider>
      ));

      expect(screen.getByText("visible content")).toBeInTheDocument();
    });
  });
});
