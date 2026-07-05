/**
 * Probe-06: forceState vs send overhead.
 *
 * sendNavigate and sendComplete bypass FSM dispatch (forceState + direct
 * emit). Compare against sendCancel (uses FSM.send → action lookup +
 * listener fan-out).
 *
 * Single FSM-only measurement: micro-benchmark the bare FSM with both
 * patterns.
 */

import { measure, do_not_optimize } from "mitata";

import { FSM } from "@real-router/fsm";

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

async function main() {
  console.log("=== probe-06: forceState vs send overhead (FSM-only) ===\n");

  // FSM mirrors routerFSM
  const config = {
    initial: "IDLE",
    context: null,
    transitions: {
      IDLE: { START: "STARTING", DISPOSE: "DISPOSED" },
      STARTING: { STARTED: "READY", FAIL: "IDLE" },
      READY: { NAVIGATE: "TRANSITION_STARTED", FAIL: "READY", STOP: "IDLE" },
      TRANSITION_STARTED: {
        NAVIGATE: "TRANSITION_STARTED",
        LEAVE_APPROVE: "LEAVE_APPROVED",
        CANCEL: "READY",
        FAIL: "READY",
      },
      LEAVE_APPROVED: {
        NAVIGATE: "TRANSITION_STARTED",
        COMPLETE: "READY",
        CANCEL: "READY",
        FAIL: "READY",
      },
      DISPOSED: {},
    },
  };

  // Variant A: forceState path (no action lookup, no listener fan-out)
  {
    const fsm = new FSM(config as any);
    fsm.send("START" as any);
    fsm.send("STARTED" as any);
    // Now in READY — alternate forceState READY ↔ TRANSITION_STARTED
    let toggle = true;
    await bench("A. forceState READY ↔ TRANSITION_STARTED", () => {
      toggle = !toggle;
      fsm.forceState(toggle ? "READY" : ("TRANSITION_STARTED" as any));
    });
  }

  // Variant B: send path with no actions (FSM-action map null)
  {
    const fsm = new FSM(config as any);
    fsm.send("START" as any);
    fsm.send("STARTED" as any);
    // alternate NAVIGATE ↔ CANCEL → READY
    await bench("B. send NAVIGATE → send CANCEL (no actions)", () => {
      fsm.send("NAVIGATE" as any);
      fsm.send("CANCEL" as any);
    });
  }

  // Variant C: send path WITH actions (mimics ROUTER_START / ROUTER_STOP)
  {
    const fsm = new FSM(config as any);
    const action = () => {};
    fsm.on("STARTING" as any, "STARTED" as any, action);
    fsm.on("READY" as any, "STOP" as any, action);
    fsm.send("START" as any);
    fsm.send("STARTED" as any);
    await bench("C. send STOP (READY→IDLE) with action installed", () => {
      fsm.send("STOP" as any); // READY → IDLE (action fires)
      fsm.send("START" as any); // IDLE → STARTING
      fsm.send("STARTED" as any); // STARTING → READY (action fires)
    });
  }
}

main().catch(console.error);
