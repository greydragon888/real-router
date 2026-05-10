import { render, screen } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { describe, it, expect } from "vitest";

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
});
