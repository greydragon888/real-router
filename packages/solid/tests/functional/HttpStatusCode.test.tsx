import { render, screen } from "@solidjs/testing-library";
import { describe, it, expect, vi } from "vitest";

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

      // Sibling renders normally — confirms the test wired up correctly.
      expect(screen.getByText("Hello")).toBeInTheDocument();

      // HttpStatusCode contributes no element children — only the sibling
      // <p>Hello</p> exists. (Solid may emit placeholder text nodes for
      // reactive slots, so we check Element children, not all child nodes.)
      const content = screen.getByTestId("content");

      expect(content.children).toHaveLength(1);
      expect(content.firstElementChild?.tagName).toBe("P");
      // No text leaks from HttpStatusCode — text content equals the sibling's.
      expect(content.textContent).toBe("Hello");
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

  describe("dev-only validation (#1441)", () => {
    // Symmetric with the preact HttpStatusCode dev-only validation: an invalid
    // `code` (not an integer in [100, 999]) logs a console.error at the source
    // — Node's res.end() would otherwise reject it mid-response. The value is
    // still written to the sink (the warning is informational, not a block).
    // Stripped from production bundles via the `process.env.NODE_ENV` guard.
    it.each([[Number.NaN], [0], [1.5], [1000]])(
      "dev-warns when code === %s (still writes to sink)",
      (invalidCode) => {
        const sink = createHttpStatusSink();
        const consoleError = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});

        render(() => (
          <HttpStatusProvider sink={sink}>
            <HttpStatusCode code={invalidCode} />
          </HttpStatusProvider>
        ));

        expect(consoleError).toHaveBeenCalledTimes(1);
        expect(consoleError).toHaveBeenCalledWith(
          expect.stringMatching(
            /^\[real-router\] <HttpStatusCode code=\{.+\} \/> received an invalid HTTP status code\./,
          ),
        );
        expect(sink.code).toBe(invalidCode);

        consoleError.mockRestore();
      },
    );

    it("does NOT warn for valid integer codes in [100, 999]", () => {
      const sink = createHttpStatusSink();
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      render(() => (
        <HttpStatusProvider sink={sink}>
          <HttpStatusCode code={100} />
          <HttpStatusCode code={404} />
          <HttpStatusCode code={999} />
        </HttpStatusProvider>
      ));

      expect(consoleError).not.toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it("does NOT warn without a provider (validation only fires on the write path)", () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      render(() => <HttpStatusCode code={Number.NaN} />);

      expect(consoleError).not.toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });
});
