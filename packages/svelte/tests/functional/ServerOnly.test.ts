import { render, screen } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { describe, it, expect } from "vitest";

import ServerOnlyBasicTest from "../helpers/ServerOnlyBasicTest.svelte";
import ServerOnlyNoFallbackTest from "../helpers/ServerOnlyNoFallbackTest.svelte";

/**
 * SSR + hydration tests are intentionally omitted in this package's vitest
 * setup — see the analogous note in `ClientOnly.test.ts` for the
 * `resolve.conditions: ["browser"]` trade-off. End-to-end SSR coverage
 * lives in `examples/web/svelte/ssr-examples/*`.
 */
describe("ServerOnly", () => {
  it("renders fallback after mount when provided", () => {
    render(ServerOnlyBasicTest);
    flushSync();

    expect(screen.getByTestId("fallback")).toBeInTheDocument();
    expect(screen.queryByTestId("children")).not.toBeInTheDocument();
  });

  it("renders nothing after mount when no fallback (default)", () => {
    render(ServerOnlyNoFallbackTest);
    flushSync();

    expect(screen.queryByTestId("children")).not.toBeInTheDocument();
  });
});
