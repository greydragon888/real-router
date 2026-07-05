/**
 * Deep-audit memory probe — createRequestScope (2026-06-25).
 *
 * createRequestScope is once-per-request: latency is not critical, memory
 * footprint is. Section 10 of the prompt. Measures:
 *   A. per-scope heap (50-route base, typical SSR app)
 *   B. leak after dispose() — target ≈ 0, "> 1KB/scope" ⇒ closure/listener leak
 *   C. DISCRIMINATING control: same loop WITHOUT dispose() — proves the probe
 *      can actually see a leak (mutational validation; CLAUDE.md heap-test rule)
 *
 * Run (against SRC, with GC): plain `npx tsx` resolves to dist/esm — add the
 * internal-source condition to measure the live src footprint:
 *   NODE_OPTIONS='--expose-gc --conditions=@real-router/internal-source' npx tsx <this file>
 */
import { createRequestScope } from "@real-router/core/utils";
import { createRouter } from "@real-router/core";

import type { Route, Router } from "@real-router/core";

function makeBase(): Router {
  const routes: Route[] = [];
  for (let i = 0; i < 50; i++) {
    routes.push({ name: `r${i}`, path: `/r${i}/:id` });
  }
  return createRouter(routes) as unknown as Router;
}

function nodeReq(): { on: () => void; removeListener: () => void } {
  // realistic Node IncomingMessage-like: stores listeners so detach is observable
  const ls = new Set<() => void>();
  return {
    on: (() => {
      ls.add(() => {});
    }) as never,
    removeListener: (() => {
      ls.clear();
    }) as never,
  };
}

function gc(): void {
  global.gc?.();
  global.gc?.();
}

const N = 2000;

async function main(): Promise<void> {
  if (!global.gc) {
    console.log("⚠ run with NODE_OPTIONS='--expose-gc' — heap deltas unreliable");
  }
  const base = makeBase();
  await base.start("/r0/1");

  // ---- warmup (let JIT + base structures settle) ----
  for (let i = 0; i < 200; i++) {
    const s = createRequestScope(nodeReq() as never, base);
    await s.dispose();
  }
  gc();

  // ---- A + B: create N, measure, dispose all, measure ----
  const heap0 = process.memoryUsage().heapUsed;
  const scopes: Array<{ dispose: () => Promise<void> }> = [];
  for (let i = 0; i < N; i++) {
    scopes.push(createRequestScope(nodeReq() as never, base));
  }
  gc();
  const heapCreated = process.memoryUsage().heapUsed;

  for (const s of scopes) await s.dispose();
  scopes.length = 0;
  gc();
  const heapDisposed = process.memoryUsage().heapUsed;

  const perScope = (heapCreated - heap0) / N;
  const leakPerScope = (heapDisposed - heap0) / N;

  console.log(`\n── A/B: dispose path (N=${N}, 50-route base) ──`);
  console.log(`  per-scope alive : ${(perScope / 1024).toFixed(2)} KB`);
  console.log(`  leak per-scope  : ${leakPerScope.toFixed(0)} bytes  (target ≈ 0; >1024 ⇒ leak)`);
  console.log(`  verdict         : ${leakPerScope < 1024 ? "CLEAN (no per-scope leak after dispose)" : "LEAK"}`);

  // ---- C: discriminating control — NEVER dispose, retain all scopes ----
  gc();
  const heapC0 = process.memoryUsage().heapUsed;
  const retained: unknown[] = [];
  for (let i = 0; i < N; i++) {
    retained.push(createRequestScope(nodeReq() as never, base));
  }
  gc();
  const heapCRetained = process.memoryUsage().heapUsed;
  const retainedPerScope = (heapCRetained - heapC0) / N;

  console.log(`\n── C: control — NO dispose, all ${N} scopes retained ──`);
  console.log(`  retained per-scope: ${(retainedPerScope / 1024).toFixed(2)} KB`);
  console.log(
    `  discriminating?   : ${retainedPerScope > leakPerScope * 4 ? "YES — probe sees the leak (retained ≫ disposed)" : "WEAK signal"}`,
  );
  console.log(`  (retained[0] kept alive: ${retained.length === N})`);

  base.stop();
  console.log("\n=== probe-02-memory complete ===");
}

void main();
