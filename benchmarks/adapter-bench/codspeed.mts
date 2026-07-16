/**
 * Single-process adapter-bench entry (CI + local).
 *
 * Mirrors packages/core/tests/benchmarks/codspeed.ts: CodSpeed's V8 flags
 * only reach the directly-wrapped process, so all six suites run serially in
 * THIS process — each suite imports its own vite-prebuilt bundle (own copy of
 * its framework runtime, so per-framework global tweaks like Preact's sync
 * debounceRendering never cross suites).
 *
 * jsdom globals are installed FIRST (side-effect import), before any bundle
 * loads. Local: `pnpm -C benchmarks run bench:adapter [fw…]` (optional
 * framework filter, e.g. `… bench:adapter solid svelte`).
 */
import "./shared/jsdom-env.mjs";

const suites: readonly (readonly [
  string,
  () => Promise<{ run: () => Promise<void> }>,
])[] = [
  ["angular", () => import("./benches/angular.bench.mjs")],
  ["preact", () => import("./benches/preact.bench.mjs")],
  ["react", () => import("./benches/react.bench.mjs")],
  ["solid", () => import("./benches/solid.bench.mjs")],
  ["svelte", () => import("./benches/svelte.bench.mjs")],
  ["vue", () => import("./benches/vue.bench.mjs")],
];

async function main(): Promise<void> {
  const filter = process.argv.slice(2);
  const selected = suites.filter(
    ([name]) => filter.length === 0 || filter.includes(name),
  );

  if (selected.length === 0) {
    throw new Error(`no suites match filter: ${filter.join(", ")}`);
  }

  for (const [name, load] of selected) {
    console.log(`\n=== ${name} ===`);
    const { run } = await load();

    await run();
  }

  console.log(`\nAll ${String(selected.length)} adapter suite(s) completed.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
