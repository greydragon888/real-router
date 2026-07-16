import { render, screen } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { describe, it, expect, vi } from "vitest";

import { createHttpStatusSink } from "../../src/utils/createHttpStatusSink";
import HttpStatusCodeBasicTest from "../helpers/HttpStatusCodeBasicTest.svelte";
import HttpStatusCodeMultipleTest from "../helpers/HttpStatusCodeMultipleTest.svelte";
import HttpStatusCodeNestedTest from "../helpers/HttpStatusCodeNestedTest.svelte";
import HttpStatusCodeNoProviderTest from "../helpers/HttpStatusCodeNoProviderTest.svelte";
import HttpStatusCodeWithChildrenTest from "../helpers/HttpStatusCodeWithChildrenTest.svelte";

/**
 * SSR + hydration tests are intentionally omitted in this package's vitest
 * setup — see the analogous note in `ClientOnly.test.ts` for the
 * `resolve.conditions: ["browser"]` trade-off. End-to-end SSR coverage lives
 * in `examples/web/svelte/ssr-examples/*`. The behaviour exercised here
 * (sink write at component init via `setContext` / `getContext`) is identical
 * across SSR and CSR — Svelte's context layer doesn't branch on environment.
 */
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
  it("writes the code to the provider's sink during render", () => {
    const sink = createHttpStatusSink();

    render(HttpStatusCodeBasicTest, { sink });
    flushSync();

    expect(sink.code).toBe(404);
  });

  it("renders nothing — siblings still emit", () => {
    const sink = createHttpStatusSink();

    render(HttpStatusCodeWithChildrenTest, { sink });
    flushSync();

    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(sink.code).toBe(410);
  });

  it("last write wins with multiple instances in render order", () => {
    const sink = createHttpStatusSink();

    render(HttpStatusCodeMultipleTest, { sink });
    flushSync();

    expect(sink.code).toBe(503);
  });

  it("non-404 codes (410 Gone, 451 Unavailable for Legal Reasons) round-trip", () => {
    const sink = createHttpStatusSink();

    render(HttpStatusCodeBasicTest, { sink, code: 451 });
    flushSync();

    expect(sink.code).toBe(451);
  });

  it("no-op without provider (safe to render anywhere)", () => {
    expect(() => {
      render(HttpStatusCodeNoProviderTest);
      flushSync();
    }).not.toThrow();
  });

  it("nested providers — inner sink wins (closest provider)", () => {
    const outer = createHttpStatusSink();
    const inner = createHttpStatusSink();

    render(HttpStatusCodeNestedTest, { outer, inner });
    flushSync();

    expect(inner.code).toBe(404);
    expect(outer.code).toBeUndefined();
  });

  describe("dev-only validation (#1441)", () => {
    // Symmetric with the preact HttpStatusCode dev-only validation: an invalid
    // `code` (not an integer in [100, 999]) logs a console.error at component
    // init — Node's res.end() would otherwise reject it mid-response. The value
    // is still written to the sink (the warning is informational, not a block).
    it.each([[Number.NaN], [0], [1.5], [1000]])(
      "dev-warns when code === %s (still writes to sink)",
      (invalidCode) => {
        const sink = createHttpStatusSink();
        const consoleError = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});

        render(HttpStatusCodeBasicTest, { sink, code: invalidCode });
        flushSync();

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

    it("does NOT warn for a valid integer code in [100, 999]", () => {
      const sink = createHttpStatusSink();
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      render(HttpStatusCodeBasicTest, { sink, code: 404 });
      flushSync();

      expect(consoleError).not.toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });
});
