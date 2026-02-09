/**
 * Isolated measure() tests for Precompute Set (#10) optimization.
 *
 * Measures:
 * 1. registerTree cost (build-time) — affected by extra Set per route
 * 2. buildPath with queryParamsMode="loose" — the hot path that benefits
 * 3. buildPath with queryParamsMode="default" — control (should be unaffected)
 *
 * Run: npx tsx tests/benchmarks/isolated-precompute-set.ts
 */

import { measure, do_not_optimize } from "mitata";

import { SegmentMatcher, buildParamMeta } from "../../src";

import type { MatcherInputNode, SegmentMatcherOptions } from "../../src";

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface SimpleRoute {
  name: string;
  path: string;
  children?: SimpleRoute[];
}

interface MeasureResult {
  avg: number;
  p50: number;
  p99: number;
  rme: number;
}

function buildNode(
  route: SimpleRoute,
  parentFullName: string,
): MatcherInputNode {
  const fullName = parentFullName
    ? `${parentFullName}.${route.name}`
    : route.name;
  const absolute = route.path.startsWith("~");
  const normalizedPath = absolute ? route.path.slice(1) : route.path;
  const paramMeta = buildParamMeta(normalizedPath);

  const childNodes: MatcherInputNode[] = [];
  const nonAbsoluteChildren: MatcherInputNode[] = [];

  if (route.children) {
    for (const child of route.children) {
      const childNode = buildNode(child, fullName);

      childNodes.push(childNode);

      if (!childNode.absolute) {
        nonAbsoluteChildren.push(childNode);
      }
    }
  }

  const childrenMap = new Map<string, MatcherInputNode>();

  for (const child of childNodes) {
    childrenMap.set(child.name, child);
  }

  return {
    name: route.name,
    path: normalizedPath,
    fullName,
    absolute,
    children: childrenMap,
    nonAbsoluteChildren,
    paramMeta,
    paramTypeMap: paramMeta.paramTypeMap,
    staticPath: null,
  };
}

function buildTree(routes: SimpleRoute[]): MatcherInputNode {
  const root: MatcherInputNode = {
    name: "",
    path: "",
    fullName: "",
    absolute: false,
    children: new Map(),
    nonAbsoluteChildren: [],
    paramMeta: buildParamMeta(""),
    paramTypeMap: {},
    staticPath: null,
  };

  const childNodes: MatcherInputNode[] = [];
  const nonAbsoluteChildren: MatcherInputNode[] = [];

  for (const route of routes) {
    const node = buildNode(route, "");

    childNodes.push(node);

    if (!node.absolute) {
      nonAbsoluteChildren.push(node);
    }
  }

  const childrenMap = new Map<string, MatcherInputNode>();

  for (const child of childNodes) {
    childrenMap.set(child.name, child);
  }

  return { ...root, children: childrenMap, nonAbsoluteChildren };
}

function createMatcher(
  routes: SimpleRoute[],
  options?: SegmentMatcherOptions,
): SegmentMatcher {
  const tree = buildTree(routes);
  const matcher = new SegmentMatcher(options);

  matcher.registerTree(tree);

  return matcher;
}

function generateWideRoutes(count: number): SimpleRoute[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `route${i}`,
    path: `/route${i}`,
  }));
}

function generateParamRoutes(count: number): SimpleRoute[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `user${i}`,
    path: `/users${i}/:id`,
  }));
}

function generateQueryRoutes(count: number): SimpleRoute[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `search${i}`,
    path: `/search${i}?q&page&sort`,
  }));
}

async function isolatedMeasure(
  name: string,
  fn: () => void,
  opts?: { warmup?: number },
): Promise<MeasureResult> {
  const warmupCount = opts?.warmup ?? 500;

  for (let i = 0; i < warmupCount; i++) {
    fn();
  }

  const stats = await measure(
    function* () {
      yield {
        // eslint-disable-next-line @typescript-eslint/no-empty-function -- mitata API
        [0]() {},
        bench() {
          fn();
        },
      };
    },
    {
      batch_samples: 5 * 1024,
      min_cpu_time: 500 * 1e6,
    },
  );

  const avg: number = stats.avg;
  const p50: number = stats.p50;
  const p99: number = stats.p99;
  const rme: number = (stats as unknown as { rme?: number }).rme ?? 0;

  console.log(
    `  ${name.padEnd(55)} avg: ${fmt(avg)}  p50: ${fmt(p50)}  rme: ${rme.toFixed(3)}%`,
  );

  return { avg, p50, p99, rme };
}

function fmt(ns: number): string {
  if (ns >= 1e6) {
    return `${(ns / 1e6).toFixed(2)} ms`;
  }

  if (ns >= 1e3) {
    return `${(ns / 1e3).toFixed(2)} µs`;
  }

  return `${ns.toFixed(2)} ns`;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("\n=== Isolated: Precompute Set (#10) ===\n");

  // ── 1. registerTree cost ──────────────────────────────────────────────────
  console.log("── registerTree (build-time cost) ──");

  for (const count of [50, 100, 500]) {
    const routes = generateWideRoutes(count);
    const tree = buildTree(routes);

    await isolatedMeasure(
      `registerTree ${count} static routes`,
      () => {
        const matcher = new SegmentMatcher();

        matcher.registerTree(tree);
      },
      { warmup: 200 },
    );
  }

  for (const count of [50, 100]) {
    const routes = generateParamRoutes(count);
    const tree = buildTree(routes);

    await isolatedMeasure(
      `registerTree ${count} param routes`,
      () => {
        const matcher = new SegmentMatcher();

        matcher.registerTree(tree);
      },
      { warmup: 200 },
    );
  }

  for (const count of [50, 100]) {
    const routes = generateQueryRoutes(count);
    const tree = buildTree(routes);

    await isolatedMeasure(
      `registerTree ${count} query routes`,
      () => {
        const matcher = new SegmentMatcher();

        matcher.registerTree(tree);
      },
      { warmup: 200 },
    );
  }

  // ── 2. buildPath: loose mode (THE beneficiary) ────────────────────────────
  console.log("\n── buildPath: queryParamsMode=loose (hot path) ──");

  {
    const routes: SimpleRoute[] = [
      { name: "search", path: "/search?q&page&sort" },
      { name: "user", path: "/users/:id" },
    ];
    const matcher = createMatcher(routes);

    await isolatedMeasure("buildPath loose: 3 query + 2 extra params", () => {
      do_not_optimize(
        matcher.buildPath(
          "search",
          { q: "test", page: "1", sort: "name", lang: "en", debug: "1" },
          {
            queryParamsMode: "loose",
          },
        ),
      );
    });

    await isolatedMeasure("buildPath loose: 3 query, no extra params", () => {
      do_not_optimize(
        matcher.buildPath(
          "search",
          { q: "test", page: "1", sort: "name" },
          {
            queryParamsMode: "loose",
          },
        ),
      );
    });

    await isolatedMeasure(
      "buildPath loose: 1 URL param + 3 extra query",
      () => {
        do_not_optimize(
          matcher.buildPath(
            "user",
            { id: "123", tab: "info", sort: "name", page: "1" },
            {
              queryParamsMode: "loose",
            },
          ),
        );
      },
    );
  }

  // ── 3. buildPath: default mode (control — should be unaffected) ───────────
  console.log("\n── buildPath: queryParamsMode=default (control) ──");

  {
    const routes: SimpleRoute[] = [
      { name: "search", path: "/search?q&page&sort" },
      { name: "user", path: "/users/:id" },
    ];
    const matcher = createMatcher(routes);

    await isolatedMeasure("buildPath default: 3 query params", () => {
      do_not_optimize(
        matcher.buildPath("search", { q: "test", page: "1", sort: "name" }),
      );
    });

    await isolatedMeasure("buildPath default: 1 URL param", () => {
      do_not_optimize(matcher.buildPath("user", { id: "123" }));
    });
  }

  // ── 4. buildPath loose: batch (×100) for stable avg ───────────────────────
  console.log("\n── buildPath loose: batch ×100 ──");

  {
    const routes: SimpleRoute[] = [
      { name: "search", path: "/search?q&page&sort" },
      { name: "user", path: "/users/:id" },
    ];
    const matcher = createMatcher(routes);

    await isolatedMeasure("buildPath loose ×100: 3 query + 2 extra", () => {
      for (let i = 0; i < 100; i++) {
        do_not_optimize(
          matcher.buildPath(
            "search",
            { q: "test", page: "1", sort: "name", lang: "en", debug: "1" },
            {
              queryParamsMode: "loose",
            },
          ),
        );
      }
    });

    await isolatedMeasure("buildPath default ×100: 3 query (control)", () => {
      for (let i = 0; i < 100; i++) {
        do_not_optimize(
          matcher.buildPath("search", { q: "test", page: "1", sort: "name" }),
        );
      }
    });
  }

  console.log("\nDone.\n");
}

main().catch(console.error);
