import { render, screen } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { describe, it, expect } from "vitest";

import ClientOnlyBasicTest from "../helpers/ClientOnlyBasicTest.svelte";
import ClientOnlyNoFallbackTest from "../helpers/ClientOnlyNoFallbackTest.svelte";

/**
 * SSR + hydration tests are intentionally omitted in this package's vitest
 * setup: `vitest.config.mts` sets `resolve.conditions: ["browser"]`, which
 * forces vite-plugin-svelte to compile every `.svelte` import in client
 * mode. `svelte/server.render()` then crashes on `$effect`/`onMount`
 * (both call `user_effect` from the client runtime, which requires a
 * client component init context). The trade-off is documented in the
 * `@real-router/svelte` CLAUDE.md "Do not override resolve.conditions"
 * note. The same SSR contract is enforced end-to-end by the
 * `examples/web/svelte/ssr-examples/*` apps via their dedicated SSR
 * Vite configs.
 */
describe("ClientOnly", () => {
  it("renders children after mount", () => {
    render(ClientOnlyBasicTest);
    flushSync();

    expect(screen.getByTestId("children")).toBeInTheDocument();
    expect(screen.queryByTestId("fallback")).not.toBeInTheDocument();
  });

  it("renders children when no fallback is provided (post-mount)", () => {
    render(ClientOnlyNoFallbackTest);
    flushSync();

    expect(screen.getByTestId("children")).toBeInTheDocument();
  });
});
