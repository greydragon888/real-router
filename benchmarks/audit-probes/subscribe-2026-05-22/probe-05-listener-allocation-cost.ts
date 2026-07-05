/**
 * Probe 05: payload allocation cost — `{route, previousRoute}` object literal
 * created per emit in EventBusNamespace.subscribe wrapper.
 *
 * Reference: EventBusNamespace.ts:244-251 — wrapper:
 *   (toState, fromState) => listener({ route: toState, previousRoute: fromState })
 *
 * Test design: navigate with 1 sync listener whose body just reads `route.name`.
 * Difference vs probe-02 (no-op listener) reveals the cost of reading from the
 * payload object — small, but the allocation itself is in probe-02 already
 * (every navigate triggers one object literal creation regardless of listener body).
 *
 * To isolate allocation cost, we compare:
 *  A. probe-02 baseline: navigate + 1 listener with no payload access
 *  B. this probe: navigate + 1 listener that destructures and reads
 *
 * Δ ≈ destructure cost (≈ 0) + property read. The allocation itself
 * is included in both — the only way to remove it is to inline emit-with-args
 * (already done in EventEmitter, see CLAUDE.md "Performance Notes").
 *
 * This probe rather measures whether the V8 JIT successfully elides the
 * temporary `{route, previousRoute}` allocation via escape analysis.
 */

import { measure, do_not_optimize } from "mitata";

import { createRouter } from "@real-router/core";

import type { Route, State } from "@real-router/core";

interface Stats { avg: number; p50: number; p99: number; stddev: number; rme: number }

function computeStats(samples: number[], avg: number): { stddev: number; rme: number; p99: number } {
  const n = samples.length;
  const variance = samples.reduce((s, x) => s + (x - avg) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);
  const sem = stddev / Math.sqrt(n);
  const rme = (1.96 * sem / avg) * 100;
  const sorted = [...samples].sort((a, b) => a - b);
  const p99 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))];
  return { stddev, rme, p99 };
}

async function bench(name: string, fn: () => void): Promise<Stats> {
  for (let i = 0; i < 500; i++) fn();

  const stats = await measure(
    function* () { yield { bench() { do_not_optimize(fn()); } }; },
    { batch_samples: 5 * 1024, min_cpu_time: 500 * 1e6 },
  );
  const { stddev, rme, p99 } = computeStats(stats.samples as number[], stats.avg);
  const fmt = (ns: number) => ns >= 1e3 ? `${(ns / 1e3).toFixed(2)} µs` : `${ns.toFixed(1)} ns`;
  console.log(`  ${name.padEnd(70)} avg=${fmt(stats.avg)}  p50=${fmt(stats.p50)}  p99=${fmt(p99)}  σ=${fmt(stddev)}  rme=${rme.toFixed(2)}%`);
  return { avg: stats.avg, p50: stats.p50, p99, stddev, rme };
}

const routes: Route[] = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
];

async function main() {
  console.log("=== probe-05: payload allocation cost (read access vs no-op listener) ===\n");

  // A. no-op listener (allocation still happens, but listener doesn't read)
  let resA: Stats;
  {
    const router = createRouter(routes);
    await router.start("/");
    router.subscribe(() => {});

    const names = ["home", "about"];
    let i = 0;
    resA = await bench("A. navigate + listener no-op (allocation occurs)", () => {
      void router.navigate(names[i++ & 1]);
    });
  }

  // B. listener that destructures + reads
  let resB: Stats;
  {
    const router = createRouter(routes);
    await router.start("/");
    let sink: string | undefined;
    router.subscribe((p: { route: State; previousRoute?: State }) => {
      sink = p.route.name;
      do_not_optimize(sink);
    });

    const names = ["home", "about"];
    let i = 0;
    resB = await bench("B. navigate + listener reads payload (forces materialization)", () => {
      void router.navigate(names[i++ & 1]);
    });
  }

  console.log("\n--- Verdict ---");
  const delta = resB.avg - resA.avg;
  const noise = 2 * Math.max(resA.stddev, resB.stddev);
  console.log(`  Payload read overhead (B - A): ${delta.toFixed(1)} ns  (noise floor ${noise.toFixed(1)} ns)`);
  if (Math.abs(delta) < noise) {
    console.log("  → [НЕ ПОДТВЕРЖДЕНО] — payload-read cost statistically zero");
    console.log("    interpretation: V8 likely scalar-replaces the {route, previousRoute} payload object");
  } else {
    console.log("  → confirmed — payload-read forces materialization of the object literal");
  }
  if (Math.max(resA.rme, resB.rme) > 5) console.log("  [NOISE] RME > 5% in at least one variant — re-run recommended");
}

main().catch(console.error);
