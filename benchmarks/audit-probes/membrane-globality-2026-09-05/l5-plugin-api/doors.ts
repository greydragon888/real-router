// Lens L5-plugin-api — mechanism probe over the doors of getPluginApi /
// getInternals / usePlugin. Each section prints the DECIDING facts for one
// door family: per-key read counts on a caller-owned container (countingBag /
// counting Proxy), and identity of what lands in core state vs what the caller
// handed in. Positive controls are inline: a known-read key must count ≥ 1
// before any zero is trusted.
//
// Run: cd W/benchmarks && NODE_OPTIONS='--conditions=@real-router/internal-source' \
//   npx tsx audit-probes/membrane-globality-2026-09-05/l5-plugin-api/doors.ts
import { createRouter, events } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import { countingBag } from "../../../../packages/core/tests/helpers/hostileBags";

import type { State } from "@real-router/core/types";

const ROUTES = [
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
  { name: "u", path: "/u/:id?tab" },
] as never;

const meta = (): State["transition"] => ({
  phase: "activating",
  reason: "success",
  segments: { deactivated: [], activated: [], intersection: "" },
});

const out = (section: string, facts: Record<string, unknown>): void => {
  console.log(`\n## ${section}`);
  for (const [k, v] of Object.entries(facts)) {
    console.log(`  ${k} = ${JSON.stringify(v)}`);
  }
};

/** A Proxy that counts `get` and `has` per string key, forwarding to target. */
function countingObject<T extends object>(target: T): {
  bag: T;
  gets: Record<string, number>;
  has: Record<string, number>;
} {
  const gets: Record<string, number> = {};
  const has: Record<string, number> = {};
  const bag = new Proxy(target, {
    get(t, k, rcv): unknown {
      if (typeof k === "string") {
        gets[k] = (gets[k] ?? 0) + 1;
      }

      return Reflect.get(t, k, rcv);
    },
    has(t, k): boolean {
      if (typeof k === "string") {
        has[k] = (has[k] ?? 0) + 1;
      }

      return Reflect.has(t, k);
    },
  });

  return { bag, gets, has };
}

async function main(): Promise<void> {
  // ---------------------------------------------------------------------
  // A. usePlugin — the plugin OBJECT the factory returns
  // ---------------------------------------------------------------------
  {
    const router = createRouter(ROUTES);
    const hooks = {
      onStart(): void {},
      onTransitionSuccess(): void {},
      teardown(): void {},
    };
    const plugin = countingObject(hooks);
    const unsub = router.usePlugin(() => plugin.bag);
    const afterUse = { gets: { ...plugin.gets }, has: { ...plugin.has } };

    await router.start("/a");
    await router.navigate("b");
    const afterNav = { gets: { ...plugin.gets } };

    unsub();

    out("A · usePlugin — plugin object (Proxy over the factory's return)", {
      "gets after usePlugin (per key)": afterUse.gets,
      "has (`in`) after usePlugin (per key)": afterUse.has,
      "gets unchanged across start+navigate (functions captured, not re-read)":
        JSON.stringify(afterNav.gets) ===
        JSON.stringify({ ...afterUse.gets }),
      "gets after unsub (teardown read count)": plugin.gets.teardown,
      "Object.isFrozen(hooks) — core froze the CALLER's object": Object.isFrozen(hooks),
      "control: an untouched literal is not frozen": Object.isFrozen({ onStart() {} }),
    });
  }

  // ---------------------------------------------------------------------
  // B. extendRouter — seed #1933
  // ---------------------------------------------------------------------
  {
    const router = createRouter(ROUTES);
    const api = getPluginApi(router);
    const leaf = { x: 1 };
    const ext = countingBag({ foo: () => 1, bar: leaf });
    const off = api.extendRouter(ext.bag as never);

    out("B · extendRouter(extensions) — seed #1933", {
      "reads per key at registration": { ...ext.reads },
      "router.bar === caller's leaf (leaf by reference)": (router as Record<string, unknown>).bar === leaf,
      "container kept? routerExtensions holds only keys": getInternals(router).routerExtensions.map((e) => e.keys),
    });
    off();
    out("B · after unsubscribe", {
      "reads per key after unsubscribe (no re-read)": { ...ext.reads },
      "'bar' in router": "bar" in router,
    });
  }

  // ---------------------------------------------------------------------
  // C. systemCommit — seed #2008 (transition read once) + seed 1 (context copied)
  // ---------------------------------------------------------------------
  {
    const router = createRouter(ROUTES);
    const api = getPluginApi(router);
    const ctx = getInternals(router);

    await router.start("/a");
    const committedByStart = router.getState();

    let hook: { to: State; from: State | undefined; opts: unknown } | undefined;

    api.addEventListener(events.TRANSITION_SUCCESS, (to, from, opts) => {
      hook = { to, from, opts };
    });

    const segments = { deactivated: [], activated: ["b"], intersection: "" };
    const transition = countingBag({ phase: "activating", reason: "success", segments });
    const context = { pre: 1 };
    const toState = countingBag({
      name: "b",
      params: {},
      search: {},
      path: "/b",
      transition: transition.bag,
      context,
    });
    const foreignFrom: State = { name: "a", params: {}, search: {}, path: "/a", transition: meta(), context: {} };
    const opts = { replace: true, marker: "M" };

    const committed = ctx.systemCommit(toState.bag as never, foreignFrom, opts as never);

    out("C · systemCommit(toState, fromState, opts) — seeds #2008 + 1", {
      "toState slot reads": { ...toState.reads },
      "transition bag key reads (via adoptForeignBag)": { ...transition.reads },
      "committed === getState()": committed === router.getState(),
      "committed.context !== caller's context (copied — seed 1)": committed.context !== context,
      "committed.context.pre": committed.context.pre,
      "committed.transition !== caller's transition bag (copied)": committed.transition !== (transition.bag as unknown),
      "committed.transition.segments === caller's segments (leaf by reference)":
        committed.transition.segments === (segments as unknown),
      "Object.isFrozen(committed.transition)": Object.isFrozen(committed.transition),
      "Object.isFrozen(caller's segments) — core did not freeze the leaf": Object.isFrozen(segments),
      "hook.opts === caller's opts (handed by reference, no adoptNavigationOptions here)": hook?.opts === opts,
      "Object.isFrozen(hook.opts)": Object.isFrozen(hook?.opts),
      "hook.from === foreign fromState (transient handle)": hook?.from === foreignFrom,
      "getPreviousState() === state committed by start (fromState arg NOT stored)":
        router.getPreviousState() === committedByStart,
    });
  }

  // ---------------------------------------------------------------------
  // D. navigateToState — state slots, opts adoption, context copy
  // ---------------------------------------------------------------------
  {
    const router = createRouter(ROUTES);
    const api = getPluginApi(router);

    await router.start("/a");

    let hook: { to: State; from: State | undefined; opts: unknown } | undefined;

    api.addEventListener(events.TRANSITION_SUCCESS, (to, from, opts) => {
      hook = { to, from, opts };
    });

    const params = { id: "9" };
    const search = { tab: "t" };
    const context = { pre: 2 };
    const transition = meta();
    const state = countingBag({ name: "u", params, search, path: "/u/9?tab=t", transition, context });
    const ac = new AbortController();
    const opts = countingBag({ replace: true, marker: "M", signal: ac.signal });

    await api.navigateToState(state.bag as never, opts.bag as never);

    const got = router.getState()!;

    out("D · navigateToState(state, options)", {
      "state slot reads": { ...state.reads },
      "opts key reads": { ...opts.reads },
      "getState().params !== caller's params (copied)": got.params !== params,
      "Object.isFrozen(getState().params)": Object.isFrozen(got.params),
      "getState().search !== caller's search (copied)": got.search !== search,
      "getState().context !== caller's context (copied)": got.context !== context,
      "getState().context.pre": got.context.pre,
      "getState().transition !== caller's transition (not carried)": got.transition !== transition,
      "hook.opts !== caller's opts (adopted copy)": hook?.opts !== (opts.bag as unknown),
      "hook.opts.marker": (hook?.opts as Record<string, unknown> | undefined)?.marker,
      "'signal' in hook.opts (withheld from the copy)": "signal" in (hook?.opts as object),
      "Object.isFrozen(hook.opts)": Object.isFrozen(hook?.opts),
    });
  }

  // ---------------------------------------------------------------------
  // E. claimContextNamespace → claim.write(state, value)
  // ---------------------------------------------------------------------
  {
    const router = createRouter(ROUTES);
    const api = getPluginApi(router);

    await router.start("/a");

    const claim = api.claimContextNamespace("ns");
    const value = { v: 1 };
    const foreignContext: Record<string, unknown> = {};
    const foreign = countingBag({ name: "u", params: {}, search: {}, path: "/u/1", transition: meta(), context: foreignContext });

    claim.write(foreign.bag as never, value);
    claim.write(router.getState()!, value);

    out("E · claim.write(state, value)", {
      "foreign state slot reads": { ...foreign.reads },
      "foreign.context.ns === value (written INTO the caller's object, leaf by ref)": foreignContext.ns === value,
      "getState().context.ns === value (committed context is core's; value by ref)": router.getState()!.context.ns === value,
      "claim record stored by identity": getInternals(router).contextClaimRecords.get("ns") === claim,
    });
  }

  // ---------------------------------------------------------------------
  // F. RouterInternals.hydrationState / .validator (assignable fields)
  // ---------------------------------------------------------------------
  {
    const router = createRouter(ROUTES);
    const ctx = getInternals(router);
    const hyd = countingBag({ name: "a", params: {}, search: {}, path: "/a", context: { data: 1 } });

    ctx.hydrationState = hyd.bag as never;
    await router.start("/a");

    const topReads: string[] = [];
    const noop = (): void => {};
    const section = new Proxy({}, { get: () => noop });
    const validator = new Proxy({}, {
      get(_t, k): unknown {
        if (typeof k === "string") {
          topReads.push(k);
        }

        return section;
      },
    });

    ctx.validator = validator as never;
    getPluginApi(router).makeState("u", { id: "1" }, {}, "/u/1");
    ctx.validator = null;

    out("F · internals fields: hydrationState / validator", {
      "hydrationState === caller's object (held by reference)": ctx.hydrationState === (hyd.bag as unknown),
      "hydrationState key reads by CORE during start (plugins read it, core does not)": { ...hyd.reads },
      "validator top-level keys read during one makeState (read by name, per call)": topReads,
    });
  }

  // ---------------------------------------------------------------------
  // G. PluginApi.forwardState — pass-through / interceptor snapshot / return
  // ---------------------------------------------------------------------
  {
    const router = createRouter(ROUTES);
    const api = getPluginApi(router);
    const bag = { id: "3" };
    const res = api.forwardState("u", bag);

    let seen: unknown;
    const offSnap = api.addInterceptor("forwardState", (next, name, params, search) => {
      seen = params;

      return next(name, params, search);
    });
    const res2 = api.forwardState("u", bag);

    offSnap();

    // Start BEFORE the returning interceptor is installed: the boot runs the
    // seam too, and a boot already landed on u/4 makes the navigate below
    // SAME_STATES (measured on the first run of this probe).
    await router.start("/a");

    const mine = { name: "u", params: { id: "4" }, search: {} };
    const offRet = api.addInterceptor("forwardState", () => mine);
    const res3 = api.forwardState("u", bag);

    await router.navigate("u", { id: "0" });
    const got = router.getState()!;

    offRet();

    out("G · forwardState(routeName, routeParams, routeSearch) + interceptor return", {
      "no interceptor: result.params === caller's bag (pass-through identity)": res.params === bag,
      "no interceptor: result.search is a frozen empty singleton": Object.isFrozen(res.search) && Object.keys(res.search).length === 0,
      "with interceptor: first interceptor sees a COPY of the caller's bag (#1849)": seen !== bag,
      "with interceptor: result.params === the copy handed to the chain": res2.params === seen,
      "interceptor returns own object: result !== that object (shell rebuilt)": (res3 as unknown) !== mine,
      "interceptor returns own object: result.params === its params (identity when clean)": res3.params === mine.params,
      "navigate: getState().params !== interceptor's params (copied by normalizeChannel)": got.params !== mine.params,
      "navigate: getState().params.id": got.params.id,
    });
  }

  // ---------------------------------------------------------------------
  // H. start interceptor return
  // ---------------------------------------------------------------------
  {
    const router = createRouter(ROUTES);
    const api = getPluginApi(router);
    const fake: State = { name: "a", params: {}, search: {}, path: "/a", transition: meta(), context: {} };

    api.addInterceptor("start", async (next, path) => {
      await next(path);

      return fake;
    });

    const resolved = await router.start("/a");

    out("H · start interceptor's returned State", {
      "start() resolves with the interceptor's object": resolved === fake,
      "getState() !== that object (core state untouched)": router.getState() !== fake,
      "getState().name": router.getState()?.name,
    });
  }

  // ---------------------------------------------------------------------
  // I. RouterInternals.matchPath(path, options) — options read by name
  // ---------------------------------------------------------------------
  {
    const router = createRouter(ROUTES);
    const ctx = getInternals(router);
    const opts = countingBag({ ...getPluginApi(router).getOptions() });
    const state = ctx.matchPath("/u/5?tab=z", opts.bag as never);

    out("I · internals.matchPath(path, options)", {
      "options key reads": { ...opts.reads },
      "matched": state?.name,
    });
  }

  // ---------------------------------------------------------------------
  // J. hand-outs: getOptions / getTree / getRouteConfig / getCloneState
  // ---------------------------------------------------------------------
  {
    const qp = { arrayFormat: "brackets" };
    const lim = { maxPlugins: 5 };
    const dp = { z: "1" };
    const router = createRouter(
      [{ name: "x", path: "/x", custom: 1, defaultParams: dp }] as never,
      { queryParams: qp, limits: lim } as never,
    );
    const api = getPluginApi(router);
    const ctx = getInternals(router);
    const options = api.getOptions();
    const cfg = api.getRouteConfig("x");
    const clone1 = ctx.getCloneState();
    const clone2 = ctx.getCloneState();

    out("J · hand-outs", {
      "Object.isFrozen(getOptions())": Object.isFrozen(options),
      "getOptions().queryParams === caller's bag (nested caller object by reference)": options.queryParams === qp,
      "getOptions().limits === caller's bag": (options.limits as unknown) === lim,
      "Object.isFrozen(getTree())": Object.isFrozen(api.getTree()),
      "getTree() stable identity": api.getTree() === api.getTree(),
      "getRouteConfig(x) === getRouteConfig(x) (live record)": cfg === api.getRouteConfig("x"),
      "getRouteConfig(x) === store.routeCustomFields.x": cfg === ctx.routeGetStore().routeCustomFields.x,
      "Object.isFrozen(getRouteConfig(x))": Object.isFrozen(cfg),
      "getCloneState().limits identity across calls (by reference, frozen)": clone1.limits === clone2.limits && Object.isFrozen(clone1.limits),
      "getCloneState().options fresh per call": clone1.options !== clone2.options,
      "getCloneState().options.queryParams === caller's bag (nested by reference)": clone1.options.queryParams === qp,
      "store.config.defaultParams.x === caller's defaultParams (routes lens; nested by ref)": ctx.routeGetStore().config.defaultParams.x === dp,
    });
  }

  // ---------------------------------------------------------------------
  // K. emitTransitionError(error) — transient handle
  // ---------------------------------------------------------------------
  {
    const router = createRouter(ROUTES);
    const api = getPluginApi(router);
    let seen: unknown;

    api.addEventListener(events.TRANSITION_ERROR, (_to, _from, err) => {
      seen = err;
    });
    const error = new Error("x");

    api.emitTransitionError(error);

    out("K · emitTransitionError(error)", {
      "listener receives the same Error object": seen === error,
    });
  }

  // ---------------------------------------------------------------------
  // L. core-owned containers published through getInternals
  // ---------------------------------------------------------------------
  {
    const router = createRouter(ROUTES);
    const api = getPluginApi(router);
    const ctx = getInternals(router);
    const myList: unknown[] = [];

    ctx.interceptors.set("start", myList as never);
    const fn = (next: (p?: string) => Promise<State>, p?: string): Promise<State> => next(p);

    api.addInterceptor("start", fn);

    const myExt = { keys: ["ghost"] };

    (router as Record<string, unknown>).ghost = 1;
    ctx.routerExtensions.push(myExt);
    router.dispose();

    out("L · containers on RouterInternals", {
      "addInterceptor pushed into the caller's array installed in ctx.interceptors": myList.includes(fn),
      "dispose() read the caller's routerExtensions entry and deleted its key": "ghost" in router,
    });
  }
}

main().catch((error: unknown) => {
  console.error("PROBE FAILED", error);
  process.exitCode = 1;
});
