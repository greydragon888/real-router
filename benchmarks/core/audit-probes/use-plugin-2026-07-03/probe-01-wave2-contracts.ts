/**
 * Probe 01 (wave 2) — behavioural verification for the usePlugin + extendRouter +
 * addInterceptor deep-audit re-run 2026-07-03 (method-deep-audit-use-plugin.md).
 *
 * Baseline 2026-06-25 verified 8 contracts (P1-P8, probe-01-plugin-contracts.ts
 * in use-plugin-2026-06-25/ — re-run separately as the regression set). This
 * wave probes the NEW questions raised by the delta window 2026-06-25..07-03:
 * #946/#982 closed the pre-bound-reference-after-dispose hazard for
 * subscribe/subscribeLeave/subscribeChanges — was usePlugin included?
 * #1035 banned sync reentrant navigate from listeners — does it reach plugin
 * handlers? Plus prompt rows never probed: teardown-time registration,
 * addInterceptor unsubscribe idempotency, symbol keys, dispose hygiene of the
 * interceptors Map.
 *
 * Structural/liveness probes only (valid on battery). Public API only.
 * Run: npx tsx benchmarks/core/audit-probes/use-plugin-2026-07-03/probe-01-wave2-contracts.ts
 * Src-mode: NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx <same>
 */

import { createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi } from "@real-router/core/api";

const ROUTES = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
  { name: "user", path: "/users/:id" },
];

function errorCode(error: unknown): string {
  return (error as { code?: string }).code ?? String(error);
}

// W1 — a usePlugin reference captured BEFORE dispose() (the constructor binds
// usePlugin precisely to support destructuring). #946 closed this hazard for
// subscribe/subscribeLeave; #982 for subscribeChanges. Does usePlugin throw —
// or silently register a zombie plugin on the disposed router?
function w1PreBoundUsePluginAfterDispose(): void {
  const r = createRouter(ROUTES);
  const up = r.usePlugin; // pre-bound capture (`const { usePlugin } = router`)

  r.dispose();

  let factoryRan = false;
  let teardownRan = false;
  let caught: unknown;

  try {
    up(() => {
      factoryRan = true;

      return {
        onTransitionSuccess() {
          /* zombie listener */
        },
        teardown() {
          teardownRan = true;
        },
      };
    });
  } catch (error) {
    caught = error;
  }

  // Control: the DIRECT call hits the #markDisposed stub.
  let directCode = "";

  try {
    r.usePlugin(() => ({}));
  } catch (error) {
    directCode = errorCode(error);
  }

  // Second dispose is an early-return no-op (FSM already DISPOSED) — the
  // zombie's teardown can never run.
  r.dispose();

  const threw = caught !== undefined;
  const verdict =
    !threw && factoryRan && !teardownRan
      ? "ZOMBIE (factory ran on disposed router, never torn down — #946-class hole)"
      : threw
        ? `throws ${errorCode(caught)}`
        : "other";

  console.log(
    `W1 pre-bound-usePlugin-after-dispose: threw=${threw} factoryRan=${factoryRan} zombieTeardownEverRan=${teardownRan} directCallCode=${directCode} => ${verdict}`,
  );
}

// W3 — addInterceptor's unsubscribe has no `removed` flag (unlike extendRouter's
// and usePlugin's). With the SAME fn registered twice, calling the FIRST
// unsubscribe twice splices by indexOf — does the second call eat the OTHER
// registration?
function w3AddInterceptorUnsubDoubleCall(): void {
  const r = createRouter(ROUTES);
  const api = getPluginApi(r);
  let hits = 0;
  const shared = (
    next: (route: string, params?: object) => string,
    route: string,
    params?: object,
  ): string => {
    hits++;

    return next(route, params);
  };

  const unsub1 = api.addInterceptor("buildPath", shared as never);

  api.addInterceptor("buildPath", shared as never); // 2nd registration, its unsub never called

  r.buildPath("about");

  const hitsWith2 = hits;

  unsub1();
  unsub1(); // double-call — idempotent unsubscribe must be a no-op

  hits = 0;
  r.buildPath("about");

  const verdict =
    hits === 1
      ? "IDEMPOTENT (2nd unsub1 call is a no-op; 2nd registration survives)"
      : `OVER-REMOVAL (double unsub1 removed ${String(2 - hits)} registrations — no idempotency flag)`;

  console.log(
    `W3 addInterceptor-unsub-double-call: hitsWith2Regs=${hitsWith2} hitsAfterDoubleUnsub1=${hits} => ${verdict}`,
  );
  r.dispose();
}

// W4 — plugin teardown calls usePlugin() DURING dispose (facade not yet
// stub-swapped — #markDisposed runs last). Set iteration semantics visit
// entries added mid-iteration, so the late plugin should be torn down in the
// same disposeAll sweep. Verify no zombie survives.
function w4UsePluginFromTeardownDuringDispose(): void {
  const r = createRouter(ROUTES);
  let lateFactoryRan = false;
  let lateTeardownRan = false;
  let teardownCaught: unknown;

  r.usePlugin(() => ({
    teardown() {
      try {
        r.usePlugin(() => {
          lateFactoryRan = true;

          return {
            teardown() {
              lateTeardownRan = true;
            },
          };
        });
      } catch (error) {
        teardownCaught = error;
      }
    },
  }));

  r.dispose();

  const threw = teardownCaught !== undefined;
  const verdict = threw
    ? `throws ${errorCode(teardownCaught)}`
    : lateFactoryRan && lateTeardownRan
      ? "CONTAINED (late plugin registered mid-dispose, torn down in same sweep — Set iteration visits new entries)"
      : lateFactoryRan
        ? "ZOMBIE (late plugin registered mid-dispose, teardown NEVER ran)"
        : "other";

  console.log(
    `W4 usePlugin-from-teardown-during-dispose: threw=${threw} lateFactoryRan=${lateFactoryRan} lateTeardownRan=${lateTeardownRan} => ${verdict}`,
  );
}

// W5 — plugin teardown calls extendRouter() DURING dispose. extendRouter has an
// explicit throwIfDisposed and the FSM is already DISPOSED (sendDispose runs
// before disposeAll) — expect ROUTER_DISPOSED, swallowed by the unsubscribe
// try/catch, router NOT polluted.
function w5ExtendRouterFromTeardownDuringDispose(): void {
  const r = createRouter(ROUTES);
  const api = getPluginApi(r);
  let extendCode = "";
  const logged: string[] = [];
  const origError = console.error.bind(console);

  console.error = (...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  };

  r.usePlugin(() => ({
    teardown() {
      try {
        api.extendRouter({ zombieProp: () => 1 });
      } catch (error) {
        extendCode = errorCode(error);
      }
    },
  }));

  r.dispose();
  console.error = origError;

  console.log(
    `W5 extendRouter-from-teardown-during-dispose: code=${extendCode} routerHasZombieProp=${"zombieProp" in r} loggerLines=${logged.length} => ${
      extendCode === "DISPOSED" && !("zombieProp" in r)
        ? "BLOCKED (throwIfDisposed fires — FSM already DISPOSED during teardown)"
        : "other"
    }`,
  );
}

// W6 — extendRouter with a symbol key: Object.keys() sees only string keys, so
// a symbol-keyed extension is neither conflict-checked nor assigned.
function w6ExtendRouterSymbolKey(): void {
  const r = createRouter(ROUTES);
  const api = getPluginApi(r);
  const sym = Symbol.iterator;
  let caught: unknown;

  try {
    api.extendRouter({ [sym]: () => 1 } as never);
  } catch (error) {
    caught = error;
  }

  const assigned =
    (r as unknown as Record<symbol, unknown>)[sym] !== undefined;

  console.log(
    `W6 extendRouter-symbol-key: threw=${caught !== undefined} symbolAssigned=${assigned} => ${
      caught === undefined && !assigned
        ? "SILENT IGNORE (Object.keys skips symbols; typed out by Record<string, unknown>)"
        : "other"
    }`,
  );
  r.dispose();
}

// W7 — dispose() safety-nets routerExtensions and contextClaimRecords but NOT
// ctx.interceptors. A plugin interceptor never unsubscribed in teardown: does
// it survive dispose and still run (buildPath is not stub-swapped)?
function w7InterceptorRetainedPostDispose(): void {
  const r = createRouter(ROUTES);
  const api = getPluginApi(r);

  r.usePlugin(() => {
    api.addInterceptor("buildPath", () => "/zombie-path");

    return {
      teardown() {
        /* deliberately forgets to unsubscribe the interceptor */
      },
    };
  });

  const pre = r.buildPath("about"); // sanity: short-circuit works pre-dispose

  r.dispose();

  let post = "";

  try {
    post = r.buildPath("about");
  } catch (error) {
    post = `threw:${errorCode(error)}`;
  }

  // Control — same call on a disposed router WITHOUT any interceptor.
  const r2 = createRouter(ROUTES);

  r2.dispose();

  let control = "";

  try {
    control = r2.buildPath("about");
  } catch (error) {
    control = `threw:${errorCode(error)}`;
  }

  console.log(
    `W7 interceptor-retained-post-dispose: pre=${pre} postDispose=${post} controlNoInterceptor=${control} => ${
      post === "/zombie-path"
        ? "RETAINED (interceptors Map has no dispose safety-net; buildPath not stub-swapped — interceptor runs on disposed router)"
        : "cleared"
    }`,
  );
}

// W8 — #1035 banned sync reentrant navigate from transition listeners. Plugin
// handlers subscribe to the same events via addEventListener — does the ban
// reach a plugin's onTransitionSuccess? (ref #1181 — listener cells filed)
async function w8PluginHandlerSyncNavigate(): Promise<void> {
  const r = createRouter(ROUTES);

  await r.start("/");

  let navCode = "";

  r.usePlugin(() => ({
    onTransitionSuccess() {
      if (navCode !== "") {
        return; // only probe the first success emit
      }

      try {
        void r.navigate("user", { id: "1" });

        navCode = "NO-THROW";
      } catch (error) {
        navCode = errorCode(error);
      }
    },
  }));

  await r.navigate("about");

  console.log(
    `W8 plugin-onTransitionSuccess-sync-navigate: result=${navCode} committedState=${String(r.getState()?.name)} => ${
      navCode === "REENTRANT_NAVIGATION"
        ? "BANNED (plugin handlers are transition listeners — #1035 ban applies, ref #1181)"
        : "allowed(?)"
    }`,
  );
  r.dispose();
}

// W9 — bare core (no validation-plugin) tolerates registering the SAME factory
// twice, but #plugins is a Set: bookkeeping collapses to one entry while
// listeners register twice. After unsub1: listeners of the 2nd registration
// still fire, yet getCloneState().pluginFactories no longer carries the
// factory — a clone loses the plugin entirely.
async function w9DuplicateFactoryBookkeeping(): Promise<void> {
  const r = createRouter(ROUTES);

  await r.start("/");

  let successHits = 0;
  let factoryRuns = 0;
  const f = (): { onTransitionSuccess: () => void } => {
    factoryRuns++;

    return {
      onTransitionSuccess() {
        successHits++;
      },
    };
  };

  const unsub1 = r.usePlugin(f);

  r.usePlugin(f); // same reference again — validator absent, no duplicate check

  await r.navigate("about");

  const hitsWith2 = successHits;

  unsub1();

  successHits = 0;
  await r.navigate("user", { id: "1" });

  const hitsAfterUnsub1 = successHits;
  const runsBeforeClone = factoryRuns;
  const clone = cloneRouter(r);
  const cloneReranFactory = factoryRuns > runsBeforeClone;

  console.log(
    `W9 duplicate-factory-bookkeeping: hitsWith2Regs=${hitsWith2} hitsAfterUnsub1=${hitsAfterUnsub1} cloneReranFactory=${cloneReranFactory} => ${
      hitsWith2 === 2 && hitsAfterUnsub1 === 1 && !cloneReranFactory
        ? "DIVERGENCE (2nd registration's listeners alive, but Set bookkeeping dropped the factory — clone loses the plugin)"
        : "consistent"
    }`,
  );
  clone.dispose();
  r.dispose();
}

async function main(): Promise<void> {
  w1PreBoundUsePluginAfterDispose();
  w3AddInterceptorUnsubDoubleCall();
  w4UsePluginFromTeardownDuringDispose();
  w5ExtendRouterFromTeardownDuringDispose();
  w6ExtendRouterSymbolKey();
  w7InterceptorRetainedPostDispose();
  await w8PluginHandlerSyncNavigate();
  await w9DuplicateFactoryBookkeeping();
}

main().catch((error: unknown) => {
  console.error("PROBE FAILED:", error);
  process.exitCode = 1;
});
