/* eslint-disable unicorn/prefer-event-target */
/**
 * EventEmitter benchmarks
 *
 * Tests isolated EventEmitter performance without Router overhead.
 * Event map mirrors real RouterEventMap signatures:
 * - 0 args: $start, $stop (cold path)
 * - 2 args: $$start, $$cancel (hot path)
 * - 3 args: $$success, $$error (hottest path)
 *
 * Key performance factors:
 * 1. emit() snapshot allocation ([...set])
 * 2. Function.prototype.apply.call dispatch
 * 3. Depth tracking (depthMap get/set in try/finally)
 * 4. Set operations for on/off (has, add, delete)
 */

import { bench, do_not_optimize } from "mitata";

import { EventEmitter } from "../../src/EventEmitter";

// ============================================================================
// Test types matching real router usage patterns
// ============================================================================

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type TestEventMap = {
  start: [];
  stop: [];
  txStart: [toState: string, fromState: string];
  txSuccess: [toState: string, fromState: string, opts: object | undefined];
  txError: [toState: string, fromState: string, err: Error | undefined];
  txCancel: [toState: string, fromState: string];
};

// Pre-made args for emit (outside bench blocks)
const args2A: [string, string] = ["users", "home"];
const args2B: [string, string] = ["home", "users"];
const args3A: [string, string, object] = ["users", "home", { reload: true }];
const args3B: [string, string, object] = ["home", "users", { replace: true }];

// Reusable listener functions
const noop = () => {};
const noop2 = (_a: string, _b: string) => {};
const noop3 = (_a: string, _b: string, _c: object | undefined) => {};

function createListener(): () => void {
  return noop.bind(null);
}

function createListener2(): (a: string, b: string) => void {
  return noop2.bind(null);
}

function createListener3(): (
  a: string,
  b: string,
  c: object | undefined,
) => void {
  return noop3.bind(null);
}

function generateListeners3(
  count: number,
): ((a: string, b: string, c: object | undefined) => void)[] {
  return Array.from({ length: count }, createListener3);
}

// ============================================================================
// Section 1: Core Operations
// ============================================================================

// 1.1 on() + off() — accumulation, fallback pattern
{
  const emitter = new EventEmitter<TestEventMap>();
  const listener = createListener();

  bench("1.1 on() + off() single listener", () => {
    const unsub = emitter.on("start", listener);

    unsub();
  }).gc("inner");
}

// 1.3 emit() with no listeners — fast path (early return)
{
  const emitter = new EventEmitter<TestEventMap>();

  bench("1.3 emit() no listeners (fast path)", () => {
    emitter.emit("txSuccess", "users", "home", { reload: true });
  }).gc("inner");
}

// 1.4 emit() 0 args, 1 listener
{
  const emitter = new EventEmitter<TestEventMap>();

  emitter.on("start", noop);

  bench("1.4 emit() 0 args, 1 listener", () => {
    emitter.emit("start");
  }).gc("inner");
}

// 1.5 emit() 2 args, 1 listener
{
  const emitter = new EventEmitter<TestEventMap>();

  emitter.on("txStart", noop2);
  let index = 0;

  bench("1.5 emit() 2 args, 1 listener", () => {
    const args = index++ % 2 === 0 ? args2A : args2B;

    emitter.emit("txStart", args[0], args[1]);
  }).gc("inner");
}

// 1.6 emit() 3 args, 1 listener — hottest path
{
  const emitter = new EventEmitter<TestEventMap>();

  emitter.on("txSuccess", noop3);
  let index = 0;

  bench("1.6 emit() 3 args, 1 listener (hot path)", () => {
    const args = index++ % 2 === 0 ? args3A : args3B;

    emitter.emit("txSuccess", args[0], args[1], args[2]);
  }).gc("inner");
}

// 1.8 listenerCount() — non-mutating read
{
  const emitter = new EventEmitter<TestEventMap>();

  emitter.on("txSuccess", createListener3());
  emitter.on("txSuccess", createListener3());
  emitter.on("txSuccess", createListener3());

  bench("1.8 listenerCount()", () => {
    do_not_optimize(emitter.listenerCount("txSuccess"));
  }).gc("inner");
}

// 1.9 setLimits() — overwrite, alternate values
{
  const emitter = new EventEmitter<TestEventMap>();
  const limitsA = { maxListeners: 100, warnListeners: 50, maxEventDepth: 5 };
  const limitsB = { maxListeners: 200, warnListeners: 100, maxEventDepth: 10 };
  let index = 0;

  bench("1.9 setLimits()", () => {
    emitter.setLimits(index++ % 2 === 0 ? limitsA : limitsB);
  }).gc("inner");
}

// ============================================================================
// Section 2: emit() Scaling
// ============================================================================

// 2.1 emit() 3 args, 3 listeners
{
  const emitter = new EventEmitter<TestEventMap>();

  for (const l of generateListeners3(3)) {
    emitter.on("txSuccess", l);
  }

  let index = 0;

  bench("2.1 emit() 3 args, 3 listeners", () => {
    const args = index++ % 2 === 0 ? args3A : args3B;

    emitter.emit("txSuccess", args[0], args[1], args[2]);
  }).gc("inner");
}

// 2.3 emit() 3 args, 10 listeners
{
  const emitter = new EventEmitter<TestEventMap>();

  for (const l of generateListeners3(10)) {
    emitter.on("txSuccess", l);
  }

  let index = 0;

  bench("2.3 emit() 3 args, 10 listeners", () => {
    const args = index++ % 2 === 0 ? args3A : args3B;

    emitter.emit("txSuccess", args[0], args[1], args[2]);
  }).gc("inner");
}

// 2.5 emit() 3 args, 100 listeners
{
  const emitter = new EventEmitter<TestEventMap>();

  for (const l of generateListeners3(100)) {
    emitter.on("txSuccess", l);
  }

  let index = 0;

  bench("2.5 emit() 3 args, 100 listeners", () => {
    const args = index++ % 2 === 0 ? args3A : args3B;

    emitter.emit("txSuccess", args[0], args[1], args[2]);
  }).gc("inner");
}

// ============================================================================
// Section 4: Depth Tracking
// ============================================================================

// 4.1 emit() without depth tracking (maxEventDepth = 0, default)
{
  const emitter = new EventEmitter<TestEventMap>();

  emitter.on("txSuccess", noop3);
  let index = 0;

  bench("4.1 emit() depth tracking OFF (maxEventDepth=0)", () => {
    const args = index++ % 2 === 0 ? args3A : args3B;

    emitter.emit("txSuccess", args[0], args[1], args[2]);
  }).gc("inner");
}

// 4.2 emit() with depth tracking enabled (maxEventDepth = 5, router default)
{
  const emitter = new EventEmitter<TestEventMap>({
    limits: { maxListeners: 0, warnListeners: 0, maxEventDepth: 5 },
  });

  emitter.on("txSuccess", noop3);
  let index = 0;

  bench("4.2 emit() depth tracking ON (maxEventDepth=5)", () => {
    const args = index++ % 2 === 0 ? args3A : args3B;

    emitter.emit("txSuccess", args[0], args[1], args[2]);
  }).gc("inner");
}

// ============================================================================
// Section 5: Real-World Patterns
// ============================================================================

// 5.1 Router lifecycle: start → txStart → txSuccess (2 emits per navigation)
{
  const emitter = new EventEmitter<TestEventMap>({
    limits: { maxListeners: 0, warnListeners: 0, maxEventDepth: 5 },
  });

  emitter.on("start", createListener());
  emitter.on("stop", createListener());
  emitter.on("txStart", createListener2());
  emitter.on("txSuccess", createListener3());
  emitter.on("txError", createListener3());
  emitter.on("txCancel", createListener2());

  let index = 0;

  bench("5.1 Navigation emit cycle (start→success), 1 plugin", () => {
    const args = index++ % 2 === 0 ? args3A : args3B;

    emitter.emit("txStart", args[0], args[1]);
    emitter.emit("txSuccess", args[0], args[1], args[2]);
  }).gc("inner");
}

// 5.5 Full navigation cycle: txStart → (3 plugins + 10 subscribers on success)
{
  const emitter = new EventEmitter<TestEventMap>({
    limits: { maxListeners: 0, warnListeners: 0, maxEventDepth: 5 },
  });

  for (let i = 0; i < 3; i++) {
    emitter.on("txStart", createListener2());
  }

  for (let i = 0; i < 3; i++) {
    emitter.on("txSuccess", createListener3());
  }

  for (const l of generateListeners3(10)) {
    emitter.on("txSuccess", l);
  }

  let index = 0;

  bench("5.5 Full navigation: 3 plugins + 10 subscribers", () => {
    const args = index++ % 2 === 0 ? args3A : args3B;

    emitter.emit("txStart", args[0], args[1]);
    emitter.emit("txSuccess", args[0], args[1], args[2]);
  }).gc("inner");
}

// ============================================================================
// Section 6: Stress Tests
// ============================================================================

// 6.2 1000 emit cycles (1 listener, 3 args)
{
  const emitter = new EventEmitter<TestEventMap>();

  emitter.on("txSuccess", noop3);

  bench("6.2 1000 emits, 1 listener", () => {
    for (let i = 0; i < 1000; i++) {
      const id = String(100 + (i % 100));

      emitter.emit("txSuccess", id, "home", { reload: true });
    }
  }).gc("inner");
}
