// P1..P4 for the family `options.signal · leaf-with-mandatory-identity`.
// One core object (executeNavigation.ts · executeNavigation, `const
// externalSignal = opts.signal`), so the properties are measured once and the
// per-door identity is established by exp-a-identity.ts.
//
// Run (from W/benchmarks):
//   NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx \
//     audit-probes/membrane-globality-2026-09-05/cls-options-signal-лист-с-обязательной-идентичностью/probe-p1-p4.ts
import { createRouter } from "@real-router/core";

function makeRig(withGuard: boolean) {
  let release: (v: boolean) => void = () => {};
  let arrive: () => void = () => {};
  const parked = new Promise<void>((res) => {
    arrive = res;
  });
  const routes: unknown[] = [
    { name: "a", path: "/a" },
    withGuard
      ? {
          name: "g",
          path: "/g",
          canActivate: () => () => {
            arrive();

            return new Promise<boolean>((res) => {
              release = res;
            });
          },
        }
      : { name: "g", path: "/g" },
  ];
  const router = createRouter(routes as never, { defaultRoute: "g" } as never);
  router.subscribeLeave(() => {});
  const seen: { opts: unknown; frozen: boolean; keys: string[] }[] = [];
  router.usePlugin(
    (() => ({
      onTransitionSuccess: (_t: unknown, _f: unknown, opts: object) => {
        seen.push({
          opts,
          frozen: Object.isFrozen(opts),
          keys: Object.keys(opts),
        });
      },
    })) as never,
  );

  return { router, release: (v: boolean) => release(v), parked, seen };
}

/** Duck signal wrapping a REAL controller: live link kept, reads counted. */
function countingSignal(real: AbortSignal) {
  const reads = { aborted: 0, reason: 0, add: 0, remove: 0 };
  const sig = {
    get aborted() {
      reads.aborted++;

      return real.aborted;
    },
    get reason() {
      reads.reason++;

      return real.reason;
    },
    addEventListener(t: string, fn: EventListener, o?: object) {
      reads.add++;
      real.addEventListener(t, fn, o as never);
    },
    removeEventListener(t: string, fn: EventListener) {
      reads.remove++;
      real.removeEventListener(t, fn);
    },
  };

  return { sig, reads };
}

/** `aborted` lies TRUE only on its Nth read — the ordinal sweep of the plan. */
function driftingSignal(n: number) {
  const reads = { aborted: 0, reason: 0 };
  const sig = {
    get aborted() {
      reads.aborted++;

      return reads.aborted === n;
    },
    get reason() {
      reads.reason++;

      return new Error("drift-reason");
    },
    addEventListener() {
      /* never fires: the lie lives in `aborted`, not in the listener */
    },
    removeEventListener() {
      /* ditto */
    },
  };

  return { sig, reads };
}

async function settleAll(): Promise<void> {
  await new Promise((r) => setTimeout(r, 10));
}

// ---------------------------------------------------------------- P1 (a)/(b)
async function p1(): Promise<void> {
  // (b) reads of the HANDLE across one live navigation, then one aborted one.
  const rig = makeRig(true);
  await rig.router.start("/a");
  const ctl = new AbortController();
  const c = countingSignal(ctl.signal);
  // (a) reads of the KEY `signal` on the caller's own bag.
  let keyReads = 0;
  const bag: Record<string, unknown> = { replace: true };
  Object.defineProperty(bag, "signal", {
    enumerable: true,
    configurable: true,
    get() {
      keyReads++;

      return c.sig;
    },
  });

  const p = rig.router
    .navigate("g", {}, undefined, bag as never)
    .then(() => "COMMITTED", (e: { code?: string }) => e.code ?? "REJECTED");
  await rig.parked;
  rig.release(true);
  const live = await p;
  await settleAll();
  console.log(
    "P1 live " +
      JSON.stringify({
        keyReadsOnBag: keyReads,
        handleReads: c.reads,
        live,
        committedTo: rig.router.getState()?.name,
        leaveApproved: rig.router.isLeaveApproved(),
      }),
  );

  // Aborted arm: the same counters with the abort actually taken.
  const rig2 = makeRig(true);
  await rig2.router.start("/a");
  const ctl2 = new AbortController();
  const c2 = countingSignal(ctl2.signal);
  let keyReads2 = 0;
  const bag2: Record<string, unknown> = {};
  Object.defineProperty(bag2, "signal", {
    enumerable: true,
    configurable: true,
    get() {
      keyReads2++;

      return c2.sig;
    },
  });
  const p2 = rig2.router
    .navigate("g", {}, undefined, bag2 as never)
    .then(() => "COMMITTED", (e: { code?: string }) => e.code ?? "REJECTED");
  await rig2.parked;
  ctl2.abort(new Error("x"));
  await settleAll();
  rig2.release(true);
  const aborted = await p2;
  await settleAll();
  console.log(
    "P1 aborted " +
      JSON.stringify({
        keyReadsOnBag: keyReads2,
        handleReads: c2.reads,
        aborted,
        committedTo: rig2.router.getState()?.name,
        leaveApproved: rig2.router.isLeaveApproved(),
        successHooks: rig2.seen.length,
      }),
  );
}

// ------------------------------------------------------------- P1 (c) drift
async function p1Drift(): Promise<void> {
  for (let n = 1; n <= 7; n++) {
    const rig = makeRig(true);
    await rig.router.start("/a");
    const d = driftingSignal(n);
    const p = rig.router
      .navigate("g", {}, undefined, { signal: d.sig } as never)
      .then(
        (s: { name?: string }) => "RESOLVED:" + String(s?.name),
        (e: { code?: string }) => e.code ?? "REJECTED",
      );
    const reached = await Promise.race([
      rig.parked.then(() => true),
      new Promise<boolean>((r) => setTimeout(() => r(false), 100)),
    ]);
    rig.release(true);
    const outcome = await Promise.race([
      p,
      new Promise<string>((r) => setTimeout(() => r("HUNG"), 200)),
    ]);
    await settleAll();
    console.log(
      "P1 drift " +
        JSON.stringify({
          nthReadLies: n,
          reachedGuard: reached,
          outcome,
          committedTo: rig.router.getState()?.name,
          leaveApproved: rig.router.isLeaveApproved(),
          successHooks: rig.seen.length,
          totalAbortedReads: d.reads.aborted,
        }),
    );
  }
}

// -------------------------------------------------------------------- P2
async function p2(): Promise<void> {
  const rig = makeRig(false);
  await rig.router.start("/a");
  const ctl = new AbortController();
  const target: Record<string, unknown> = { replace: true, signal: ctl.signal };
  const lying = new Proxy(target, {
    // ownKeys DENIES `signal`; the target is extensible and the key is
    // configurable, so this lie is a legal Proxy.
    ownKeys: () => ["replace"],
    getOwnPropertyDescriptor: (t, k) =>
      Object.getOwnPropertyDescriptor(t, k as string),
  });

  // Positive control: the honest Proxy over the same target.
  const honest = new Proxy({ ...target }, {});

  for (const [label, bag] of [
    ["lyingOwnKeys", lying],
    ["honestControl", honest],
  ] as const) {
    const r = makeRig(true);
    await r.router.start("/a");
    const c = new AbortController();
    const b = new Proxy(
      { replace: true, signal: c.signal } as Record<string, unknown>,
      label === "lyingOwnKeys"
        ? {
            ownKeys: () => ["replace"],
            getOwnPropertyDescriptor: (t, k) =>
              Object.getOwnPropertyDescriptor(t, k as string),
          }
        : {},
    );
    const p = r.router
      .navigate("g", {}, undefined, b as never)
      .then(() => "COMMITTED", (e: { code?: string }) => e.code ?? "REJECTED");
    await r.parked;
    c.abort(new Error("x"));
    await settleAll();
    r.release(true);
    const outcome = await p;
    await settleAll();
    console.log(
      "P2 " +
        JSON.stringify({
          bagKind: label,
          bagOwnKeys: Object.keys(b),
          signalHeardTheAbort: outcome === "CANCELLED",
          outcome,
          committedTo: r.router.getState()?.name,
          pluginVisibleOptsKeys: r.seen.map((s) => s.keys),
        }),
    );
  }
  void bagUnused(rig, lying);
}

function bagUnused(a: unknown, b: unknown): void {
  void a;
  void b;
}

// -------------------------------------------------------------------- P3
async function p3(): Promise<void> {
  // NEGATIVE CONTROL, no ambient accessor installed: the same two calls.
  const c0 = makeRig(false);
  const s0 = await c0.router
    .start("/a")
    .then(() => "STARTED", (e: { code?: string }) => e.code ?? "REJECTED");
  const n0 = await c0.router
    .navigate("g")
    .then(() => "COMMITTED", (e: { code?: string }) => e.code ?? "REJECTED");
  await settleAll();
  console.log(
    "P3 control/noAmbient " +
      JSON.stringify({
        startOutcome: s0,
        navigateOutcome: n0,
        committedTo: c0.router.getState()?.name,
      }),
  );

  const stranger = new AbortController();
  stranger.abort(new Error("ambient-stranger"));
  let getCalls = 0;
  let setCalls = 0;

  Object.defineProperty(Object.prototype, "signal", {
    configurable: true,
    get() {
      getCalls++;

      return stranger.signal;
    },
    set() {
      setCalls++;
    },
  });

  try {
    // (a) NO options at all: `start()` and `navigate("g")` pass core's own
    //     frozen EMPTY_OPTS, whose prototype is Object.prototype.
    const r1 = makeRig(false);
    const startOutcome = await r1.router
      .start("/a")
      .then(() => "STARTED", (e: { code?: string }) => e.code ?? "REJECTED");
    const o1 = await r1.router
      .navigate("g")
      .then(() => "COMMITTED", (e: { code?: string }) => e.code ?? "REJECTED");
    await settleAll();
    console.log(
      "P3 ambient/EMPTY_OPTS " +
        JSON.stringify({
          startOutcome,
          navigateOutcome: o1,
          committedTo: r1.router.getState()?.name,
          ambientGetCalls: getCalls,
          ambientSetCalls: setCalls,
        }),
    );

    // (b) a plain caller bag with NO own `signal`.
    const before = getCalls;
    const r2 = makeRig(false);
    await r2.router
      .start("/a")
      .then(() => "STARTED", () => "REJECTED");
    const bag: Record<string, unknown> = { replace: true };
    const o2 = await r2.router
      .navigate("g", {}, undefined, bag as never)
      .then(() => "COMMITTED", (e: { code?: string }) => e.code ?? "REJECTED");
    await settleAll();
    console.log(
      "P3 ambient/plainBag " +
        JSON.stringify({
          outcome: o2,
          committedTo: r2.router.getState()?.name,
          ambientGetCallsDelta: getCalls - before,
          ambientSetCalls: setCalls,
          callerBagOwnKeys: Object.keys(bag),
          pluginVisibleOptsKeys: r2.seen.map((s) => s.keys),
        }),
    );
  } finally {
    delete (Object.prototype as Record<string, unknown>).signal;
  }
  console.log(
    "P3 cleanup " +
      JSON.stringify({
        protoStillHasSignal: "signal" in ({} as Record<string, unknown>),
      }),
  );

  // (c) own "__proto__" beside the signal — the UNSAFE_KEY half of P3.
  const r3 = makeRig(false);
  await r3.router.start("/a");
  const polluting = JSON.parse('{"__proto__":{"pwned":1},"replace":true}') as
    Record<string, unknown>;
  const ctl = new AbortController();
  polluting.signal = ctl.signal;
  await r3.router
    .navigate("g", {}, undefined, polluting as never)
    .catch(() => undefined);
  await settleAll();
  console.log(
    "P3 __proto__ " +
      JSON.stringify({
        ownProtoKeyOnCallerBag: Object.hasOwn(polluting, "__proto__"),
        objectPrototypePwned:
          ({} as Record<string, unknown>).pwned !== undefined,
        pluginVisibleOptsKeys: r3.seen.map((s) => s.keys),
        pluginOptsHasProtoKey: r3.seen.map((s) =>
          Object.hasOwn(s.opts as object, "__proto__"),
        ),
      }),
  );
}

// -------------------------------------------------------------------- P4
async function p4(): Promise<void> {
  const rig = makeRig(false);
  await rig.router.start("/a");
  const ctl = new AbortController();
  const bag: Record<string, unknown> = {
    replace: true,
    signal: ctl.signal,
    nested: { deep: 1 },
  };
  await rig.router.navigate("g", {}, undefined, bag as never);
  await settleAll();
  console.log(
    "P4 " +
      JSON.stringify({
        callerSignalFrozen: Object.isFrozen(ctl.signal),
        callerBagFrozen: Object.isFrozen(bag),
        callerNestedFrozen: Object.isFrozen(bag.nested),
        coreBornCopyFrozen: rig.seen.map((s) => s.frozen),
        coreBornCopyKeys: rig.seen.map((s) => s.keys),
        coreBornCopyIsCallerBag: rig.seen.map((s) => s.opts === bag),
        coreBornCopyHasSignal: rig.seen.map((s) =>
          Object.hasOwn(s.opts as object, "signal"),
        ),
        coreBornNestedIsCallerNested: rig.seen.map(
          (s) => (s.opts as Record<string, unknown>).nested === bag.nested,
        ),
        coreBornNestedFrozen: rig.seen.map((s) =>
          Object.isFrozen((s.opts as Record<string, unknown>).nested),
        ),
      }),
  );
}

async function main(): Promise<void> {
  await p1();
  await p1Drift();
  await p2();
  await p3();
  await p4();
}

void main();
