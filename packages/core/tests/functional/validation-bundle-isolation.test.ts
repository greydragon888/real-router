// Guards the M1 tiering invariant (#1526, RFC #1516 §3.2): core's main entry
// (`src/index.ts`) must not ship the engine's `validateRoute` gate —
// `engine/validation/routes.ts` with its rich route-contextual reject recipes
// (computed sibling paths, reserved-`<>` explanations). Those belong only to
// the `@real-router/core/validation` subpath chunk (`src/validation.ts`),
// pulled in exclusively by `@real-router/validation-plugin`.
//
// Why not a static module-graph walk (the #800 methodology): `validateRoute`
// is load-bearing on the engine barrel (`engine/index.ts`) — `src/validation.ts`
// re-exports it from there, and core's runtime value-imports OTHER engine
// functions (`createRouteTree`, `createMatcher`, …) through the same barrel.
// A static walk from the main entry therefore always sees
// `validateRoute → route-batch → routes.ts` as reachable — a false positive.
// What actually removes the gate is per-symbol tree-shaking, so this test
// measures what actually ships: it bundles both entries with rolldown — the
// engine of tsdown, resolved THROUGH tsdown so it is the exact bundler version
// that produces the real `dist/` — and asserts on the output chunks.
//
// The markers are string literals unique to `engine/validation/routes.ts`:
// every reject message there starts with `Invalid path for route`, while the
// matcher backstop (which legitimately ships in the main chunk) prefixes its
// recipes with `[SegmentMatcher.registerTree]`. The positive control on the
// `./validation` chunk keeps the absence assertion honest twice over: a
// reworded message or a silently broken bundling setup fails there instead of
// passing vacuously here.
//
// Discriminating power (validated mutationally, 2026-07-20): injecting a live
// `validateRoute(...)` call into `RoutesNamespace/routesStore.ts` puts the
// marker into the main chunk and fails the absence assertion.

import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const SRC_DIR = path.resolve(__dirname, "../../src");
const MAIN_ENTRY = path.join(SRC_DIR, "index.ts");
const VALIDATION_ENTRY = path.join(SRC_DIR, "validation.ts");

const GATE_MARKERS = [
  // Shared prefix of every reject message in engine/validation/routes.ts —
  // unique to that module across src/.
  "Invalid path for route",
  // The rich optional-removed replacement recipe (sibling paths computed from
  // the actual path) — only the gate builds it.
  "Declare two sibling routes instead",
];

// Minimal surface of the rolldown API this test touches (the package ships its
// own types, but we import it dynamically from tsdown's dependency tree).
type RolldownOutput = { type: "chunk"; code: string } | { type: "asset" };

interface RolldownBundle {
  generate: (options: {
    format: "esm";
  }) => Promise<{ output: RolldownOutput[] }>;
  close: () => Promise<void>;
}

type RolldownFn = (options: {
  input: string;
  logLevel: "silent";
}) => Promise<RolldownBundle>;

/**
 * Resolves rolldown from tsdown's own dependency tree. Pinning the test to the
 * bundler tsdown actually uses removes the "test bundler ≠ prod bundler" drift
 * class and avoids a separate rolldown devDependency.
 */
function resolveRolldownEntry(): string {
  const testRequire = createRequire(__filename);

  try {
    return createRequire(testRequire.resolve("tsdown")).resolve("rolldown");
  } catch {
    throw new Error(
      "tsdown no longer depends on rolldown — rewire this test to the bundler tsdown actually uses",
    );
  }
}

/** Bundles an entry in-memory (tree-shaking on) and returns the joined chunk code. */
async function bundleEntry(entry: string): Promise<string> {
  const { rolldown } = (await import(
    pathToFileURL(resolveRolldownEntry()).href
  )) as { rolldown: RolldownFn };

  const bundle = await rolldown({ input: entry, logLevel: "silent" });

  try {
    const { output } = await bundle.generate({ format: "esm" });

    return output
      .flatMap((chunk) => (chunk.type === "chunk" ? [chunk.code] : []))
      .join("\n");
  } finally {
    await bundle.close();
  }
}

describe("validation bundle isolation (#1526)", () => {
  it("main entry does not ship the validateRoute gate strings", async () => {
    const code = await bundleEntry(MAIN_ENTRY);

    // Non-vacuity: the bundle is real core, not an empty or failed build.
    expect(code).toContain("createRouter");

    for (const marker of GATE_MARKERS) {
      expect(code).not.toContain(marker);
    }
  });

  it("the ./validation subpath chunk ships them (positive control)", async () => {
    const code = await bundleEntry(VALIDATION_ENTRY);

    for (const marker of GATE_MARKERS) {
      expect(code).toContain(marker);
    }
  });
});
