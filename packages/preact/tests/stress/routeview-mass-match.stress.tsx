// packages/preact/tests/stress/routeview-mass-match.stress.tsx

/**
 * Stress test for `RouteView` with a large number of `<RouteView.Match>` children.
 *
 * Closes review §7 #8 (MEDIUM): "RouteView.Match × 1000 узлов — `link-mass-
 * rendering` тестирует 500 Links, но RouteView с 1000 Match отсутствует.
 * `combined-spa.stress.tsx` использует 5 Match. На 1000 Match можно увидеть
 * >16ms render → пропущенный кадр." Hot consumer: admin panels, feature-flag
 * dashboards, large segment-based router trees.
 *
 * Pipeline under test:
 *   - `collectElements` walks children once, O(N) for N siblings
 *   - `buildRenderList` walks the collected list, O(N), first-Match-wins
 *     short-circuit means only ONE Match contributes a render entry
 *   - On every navigation: useRoute re-renders RouteView, both walks re-run
 *
 * Invariants:
 *   - 1000 Match siblings mount without exceeding heap bounds
 *   - Single render pass stays within an order of magnitude of the
 *     16 ms frame budget (env-dependent, so we assert generous upper bounds —
 *     a regression that drops `alreadyActive` short-circuit would surface as
 *     O(N²) traversal time growing well past these caps)
 *   - Only the matching Match contributes — sibling Matches do not render
 *   - Navigation across 50 cycles never grows heap past a bounded delta
 */

import { createRouter } from "@real-router/core";
import { act, cleanup, render } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";

import { RouteView, RouterProvider } from "@real-router/preact";

import { forceGC, getHeapUsedBytes, MB } from "./helpers";

import type { Route, Router } from "@real-router/core";

const MATCH_COUNT = 1000;

function createMassRouter(count: number): Router {
  const routes: Route[] = Array.from({ length: count }, (_, i) => ({
    name: `route${i}`,
    path: `/route${i}`,
  }));

  return createRouter(routes, { defaultRoute: "route0" });
}

function MassRouteView({ count }: { readonly count: number }) {
  // Inline children array — RouteView walks `slotChildren` via collectElements.
  const matches = [];

  for (let i = 0; i < count; i++) {
    matches.push(
      <RouteView.Match segment={`route${i}`} key={`route${i}`}>
        <div data-testid={`match-${i}`}>Match {i}</div>
      </RouteView.Match>,
    );
  }

  return <RouteView nodeName="">{matches}</RouteView>;
}

describe("preact stress — RouteView × 1000 Match", () => {
  afterEach(() => {
    cleanup();
  });

  it("1000 Match siblings mount and render the active one only", async () => {
    const router = createMassRouter(MATCH_COUNT);

    await router.start("/route0");

    forceGC();
    const before = getHeapUsedBytes();
    const renderStart = performance.now();

    const { getByTestId, queryByTestId } = render(
      <RouterProvider router={router}>
        <MassRouteView count={MATCH_COUNT} />
      </RouterProvider>,
    );

    const renderDuration = performance.now() - renderStart;

    // Only the active Match renders content.
    expect(getByTestId("match-0").textContent).toBe("Match 0");
    expect(queryByTestId("match-1")).not.toBeInTheDocument();
    expect(queryByTestId("match-999")).not.toBeInTheDocument();

    forceGC();
    const after = getHeapUsedBytes();
    const heapDelta = after - before;

    // Generous bound — jsdom + Preact + 1000 marker components is naturally
    // memory-heavy; 50 MB cap catches a regression that materializes every
    // Match instead of only the active one.
    expect(heapDelta).toBeLessThan(50 * MB);

    // Generous render-time bound: well above 16 ms because jsdom is ~10x
    // slower than browsers, but a regression to O(N²) pipeline traversal
    // would push past several seconds.
    expect(renderDuration).toBeLessThan(2000);

    router.stop();
  });

  it("navigation across 50 cycles through 1000 Match siblings stays bounded", async () => {
    const router = createMassRouter(MATCH_COUNT);

    await router.start("/route0");

    render(
      <RouterProvider router={router}>
        <MassRouteView count={MATCH_COUNT} />
      </RouterProvider>,
    );

    forceGC();
    const baseline = getHeapUsedBytes();

    // 50 round-robin navigations — touch a different Match each time so the
    // pipeline cannot cache a single active result across iterations. Start
    // at i=1 (i=0 would target route0 — the start state — and trigger
    // core's SAME_STATES rejection on the first iteration).
    for (let i = 1; i <= 50; i++) {
      const target = `route${(i * 13) % MATCH_COUNT}`;

      await act(async () => {
        await router.navigate(target);
      });
    }

    forceGC();
    const final = getHeapUsedBytes();
    const heapGrowth = final - baseline;

    // Heap MUST NOT grow unboundedly with navigation count — leaks in the
    // RouteView pipeline (lingering refs to old child arrays, uncleared
    // closures from collectElements) would show up here.
    expect(heapGrowth).toBeLessThan(20 * MB);

    router.stop();
  });

  it("first-Match-wins short-circuit: duplicate segments → only first renders", async () => {
    // Lock the `alreadyActive` guard at scale: 100 Match siblings all with the
    // same segment must render exactly one entry, not 100. A regression that
    // dropped the short-circuit would surface as 100× duplicate DOM nodes.
    const router = createMassRouter(MATCH_COUNT);

    await router.start("/route0");

    const matches = Array.from({ length: 100 }, (_, i) => (
      <RouteView.Match segment="route0" key={`dup-${i}`}>
        <div data-testid={`dup-${i}`}>Dup {i}</div>
      </RouteView.Match>
    ));

    const { getAllByTestId, queryAllByTestId } = render(
      <RouterProvider router={router}>
        <RouteView nodeName="">{matches}</RouteView>
      </RouterProvider>,
    );

    // Only the first Match in source order activates.
    expect(getAllByTestId("dup-0")).toHaveLength(1);

    for (let i = 1; i < 100; i++) {
      expect(queryAllByTestId(`dup-${i}`)).toHaveLength(0);
    }

    router.stop();
  });
});
