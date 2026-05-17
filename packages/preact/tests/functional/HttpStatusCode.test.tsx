import { render, screen } from "@testing-library/preact";
import { renderToString } from "preact-render-to-string";
import { describe, it, expect } from "vitest";

import {
  HttpStatusCode,
  HttpStatusProvider,
  createHttpStatusSink,
} from "@real-router/preact/ssr";

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

  it("is NOT auto-frozen by the factory (behaviour lock — consumer may freeze if desired)", () => {
    // Locks documented behaviour: createHttpStatusSink does not Object.freeze
    // the returned object. The mutable `sink.code = N` write is the documented
    // protocol — freezing would break it. This test fixes the contract so any
    // future "defensive freeze" PR has to revisit the docs first.
    const sink = createHttpStatusSink();

    expect(Object.isFrozen(sink)).toBe(false);
    expect(Object.isSealed(sink)).toBe(false);

    // Mutable write must succeed without throwing in strict mode.
    sink.code = 200;

    expect(sink.code).toBe(200);
  });

  it("throws TypeError when consumer-frozen sink is written to", () => {
    // A defensive consumer might freeze the sink before render. In strict-mode
    // ESM, assigning to a frozen object property throws a TypeError — that is
    // the expected behaviour here. The render will throw; the consumer is
    // responsible for not freezing the sink in production.
    const sink = Object.freeze(createHttpStatusSink());

    expect(() => {
      renderToString(
        <HttpStatusProvider sink={sink}>
          <HttpStatusCode code={404} />
        </HttpStatusProvider>,
      );
    }).toThrow(TypeError);

    // The write was rejected before it could complete — code stays at its
    // initial undefined value.
    expect(sink.code).toBeUndefined();
  });
});

describe("HttpStatusCode", () => {
  describe("SSR (preact-render-to-string)", () => {
    it("writes the code to the provider's sink during render", () => {
      const sink = createHttpStatusSink();

      const html = renderToString(
        <HttpStatusProvider sink={sink}>
          <HttpStatusCode code={404} />
        </HttpStatusProvider>,
      );

      expect(sink.code).toBe(404);
      expect(html).toBe("");
    });

    it("produces no HTML of its own (status code stays out of markup)", () => {
      const sink = createHttpStatusSink();

      const html = renderToString(
        <HttpStatusProvider sink={sink}>
          <div data-testid="content">
            <HttpStatusCode code={410} />
            <p>Hello</p>
          </div>
        </HttpStatusProvider>,
      );

      // HttpStatusCode renders null — no markup is emitted for the code itself.
      expect(html).toContain("Hello");
      expect(html).not.toContain("410");
      // The code was delivered to the sink, not the markup.
      expect(sink.code).toBe(410);
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
      const html = renderToString(<HttpStatusCode code={404} />);

      expect(html).toBe("");
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
