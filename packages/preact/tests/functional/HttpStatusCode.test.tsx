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

  describe("dev-only validation (review §5 Bug 3)", () => {
    // Lock the development-only console.error emitted when `code` is not a
    // valid HTTP status integer in [100, 999]. Node's res.end() rejects bad
    // values with "Invalid status code"; the dev warning surfaces the bad
    // value at the React/Preact source rather than at the response boundary.
    // The warning is stripped from production bundles via the
    // `process.env.NODE_ENV !== "production"` guard.
    it.each([
      [Number.NaN, "NaN"],
      [0, "0"],
      [-1, "-1"],
      [99, "99"],
      [1000, "1000"],
      [9999, "9999"],
      [200.5, "200.5"],
      [Infinity, "Infinity"],
      [-Infinity, "-Infinity"],
    ])(
      "dev-warns when code === %s (still writes to sink for downstream observability)",
      (invalidCode) => {
        const sink = createHttpStatusSink();
        const consoleError = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});

        renderToString(
          <HttpStatusProvider sink={sink}>
            <HttpStatusCode code={invalidCode} />
          </HttpStatusProvider>,
        );

        expect(consoleError).toHaveBeenCalledTimes(1);
        expect(consoleError).toHaveBeenCalledWith(
          expect.stringMatching(
            /^\[real-router\] <HttpStatusCode code=\{.+\} \/> received an invalid HTTP status code\./,
          ),
        );

        // The value is still propagated — the warning is informational, not
        // a hard block. Consumers can detect the bad value in the sink and
        // fall back to a known-good default before sending the response.
        expect(sink.code).toBe(invalidCode);

        consoleError.mockRestore();
      },
    );

    it("does NOT warn for valid integer codes in [100, 999]", () => {
      const sink = createHttpStatusSink();
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      renderToString(
        <HttpStatusProvider sink={sink}>
          <HttpStatusCode code={100} />
          <HttpStatusCode code={404} />
          <HttpStatusCode code={503} />
          <HttpStatusCode code={999} />
        </HttpStatusProvider>,
      );

      expect(consoleError).not.toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it("does NOT warn when no provider is mounted (validation only fires on the write path)", () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      // Without a provider the component is a silent no-op; the validation
      // branch is guarded by `if (sink)` and must not fire either.
      renderToString(<HttpStatusCode code={Number.NaN} />);

      expect(consoleError).not.toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });
});
