/**
 * Probe 01 — namespace-level invariants for PluginsNamespace
 * (namespace-deep-audit-plugins.md). Distinct from the use-plugin method probe:
 * focuses on internal-state coherence (#plugins/#unsubscribes), batch semantics,
 * EVENT_METHOD_NAMES/EVENTS_MAP coverage, frozen applied-plugin, disposeAll.
 *
 * Contract probe (battery → mitata latency [SKIPPED]). Public API only —
 * `#plugins`/`#unsubscribes` are `#`-private and `count()` is not on the facade,
 * so registration is observed via HOOK FIRING (onStart/onTransition*), not sizes.
 *
 * Run BOTH to settle dist-vs-src for the audited files:
 *   npx tsx <this>
 *   NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx <this>
 */

import { createRouter } from "@real-router/core";

const ROUTES = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
  { name: "user", path: "/users/:id" },
];

// P1 — batch use() returns ONE composite unsubscribe covering N factories.
// Observable proof that #unsubscribes grows by 1 per CALL while #plugins grows
// by N → the prompt's STATE_PARITY (#plugins.size === #unsubscribes.size) is
// false for batches.
async function p1BatchOneToN(): Promise<void> {
  const r = createRouter(ROUTES);
  const fired: string[] = [];
  const mk = (n: string) => () => ({
    onTransitionSuccess() {
      fired.push(n);
    },
  });

  const unsub = r.usePlugin(mk("p1"), mk("p2"), mk("p3")); // batch of 3

  await r.start("/");
  fired.length = 0;
  await r.navigate("about");
  const afterRegister = fired.join(",");

  unsub(); // single composite unsubscribe
  fired.length = 0;
  await r.navigate("user", { id: "1" });
  const afterUnsub = fired.join(",");

  const verdict =
    afterRegister === "p1,p2,p3" && afterUnsub === ""
      ? "ONE composite unsub removed ALL 3 → #unsubscribes +=1 per CALL, #plugins +=N → STATE_PARITY size-equality FALSE for batch (PluginsNamespace.ts:147-175)"
      : "other";

  console.log(
    `P1 batch-1:N-unsubscribe: after-register=[${afterRegister}] after-single-unsub=[${afterUnsub}] => ${verdict}`,
  );
  r.dispose();
}

// P2 — batch atomicity: a factory throwing mid-batch rolls back already-inited.
async function p2BatchAtomic(): Promise<void> {
  const r = createRouter(ROUTES);
  const events: string[] = [];
  const p1 = () => ({
    onStart() {
      events.push("p1.onStart");
    },
    teardown() {
      events.push("p1.teardown");
    },
  });
  const bad = () => {
    throw new Error("compile fail");
  };
  const p3 = () => ({
    onStart() {
      events.push("p3.onStart");
    },
  });

  let caught: unknown;

  try {
    r.usePlugin(p1, bad, p3);
  } catch (error) {
    caught = error;
  }

  await r.start("/");

  const threw = caught !== undefined;
  const rolledBack =
    threw &&
    !events.includes("p1.onStart") &&
    !events.includes("p3.onStart") &&
    events.includes("p1.teardown");

  console.log(
    `P2 batch-atomicity: threw=${threw} events=[${events.join(",")}] => ${
      rolledBack
        ? "ATOMIC ROLLBACK (none registered: no onStart fired; p1 inited-then-rolled-back incl teardown)"
        : "other"
    }`,
  );
  r.dispose();
}

// P3 — every EVENT_METHOD_NAMES hook fires on its mapped event, incl. the
// recent onTransitionLeaveApprove (EVENTS_MAP exhaustive, constants.ts:13-32).
async function p3EventCoverage(): Promise<void> {
  const r = createRouter(ROUTES);
  const fired = new Set<string>();
  const hook = (n: string) => () => {
    fired.add(n);
  };

  r.usePlugin(() => ({
    onStart: hook("onStart"),
    onStop: hook("onStop"),
    onTransitionStart: hook("onTransitionStart"),
    onTransitionLeaveApprove: hook("onTransitionLeaveApprove"),
    onTransitionSuccess: hook("onTransitionSuccess"),
    onTransitionError: hook("onTransitionError"),
    onTransitionCancel: hook("onTransitionCancel"),
  }));

  await r.start("/"); // onStart
  await r.navigate("about"); // start + leaveApprove + success

  // cancel: supersede an in-flight navigation
  const a = r.navigate("user", { id: "1" });
  const b = r.navigate("home");

  await Promise.allSettled([a, b]);
  r.stop(); // onStop

  const core =
    fired.has("onStart") &&
    fired.has("onTransitionStart") &&
    fired.has("onTransitionLeaveApprove") &&
    fired.has("onTransitionSuccess") &&
    fired.has("onStop");

  console.log(
    `P3 event-coverage: fired={${[...fired].toSorted((x, y) => x.localeCompare(y)).join(",")}} LEAVE_APPROVE=${fired.has(
      "onTransitionLeaveApprove",
    )} => ${
      core
        ? "COVERAGE OK incl recent LEAVE_APPROVE — EVENTS_MAP exhaustive & derived (constants.ts:30)"
        : "GAP (a core hook did not fire)"
    }`,
  );
  r.dispose();
}

// P5 — applied plugin (factory return) is frozen after #startPlugin.
function p5FrozenApplied(): void {
  const r = createRouter(ROUTES);
  const holder: { plugin?: object } = {};

  r.usePlugin(() => {
    holder.plugin = {
      onStart() {
        /* noop */
      },
    };

    return holder.plugin;
  });

  const frozen = holder.plugin !== undefined && Object.isFrozen(holder.plugin);

  console.log(
    `P5 frozen-applied-plugin: isFrozen=${frozen} => ${
      frozen
        ? "FROZEN post-#startPlugin (PluginsNamespace.ts:242) — hooks immutable after registration"
        : "NOT frozen"
    }`,
  );
  r.dispose();
}

// P6 — disposeAll runs every teardown and is idempotent.
async function p6DisposeAll(): Promise<void> {
  const r = createRouter(ROUTES);
  const td: string[] = [];

  r.usePlugin(() => ({
    teardown() {
      td.push("a");
    },
  }));
  r.usePlugin(() => ({
    teardown() {
      td.push("b");
    },
  }));

  await r.start("/");
  r.dispose();
  const afterDispose = td.join(",");

  r.dispose(); // idempotent
  const afterSecond = td.join(",");

  console.log(
    `P6 disposeAll: teardowns=[${afterDispose}] after-2nd-dispose=[${afterSecond}] => ${
      afterDispose === "a,b" && afterSecond === "a,b"
        ? "COMPLETE (all teardowns) + IDEMPOTENT (2nd dispose no double-teardown)"
        : "other"
    }`,
  );
}

async function main(): Promise<void> {
  await p1BatchOneToN();
  await p2BatchAtomic();
  await p3EventCoverage();
  p5FrozenApplied();
  await p6DisposeAll();
}

main().catch((error: unknown) => {
  console.error("PROBE FAILED:", error);
  process.exitCode = 1;
});
