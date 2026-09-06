// Триаж-батч: makeState/buildNavigationState·search, navigate/navigateToDefault/
// navigateToState·options, navigateToState·state(.context), systemCommit·toState(.transition).
// Решает три вопроса на дверь: (1) сколько раз ЯДРО читает объект вызывающего,
// (2) что легло в состояние ядра — объект вызывающего или его копия,
// (3) отдаётся ли объект обратно приложению (хэндаут-наблюдаемость).
// Позитивный контроль в каждой секции: заведомо легальный ключ обязан быть
// прочитан >=1 и обязан ДОЙТИ до состояния (иначе ноль ничего не значит).
//
// Run: cd W/benchmarks && NODE_OPTIONS='--conditions=@real-router/internal-source' \
//   npx tsx audit-probes/membrane-globality-2026-09-05/triage-nav-options-state/triage.ts
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import type { State } from "@real-router/core/types";

const ROUTES = [
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
  { name: "u", path: "/u/:id?tab" },
] as never;

const out = (section: string, facts: Record<string, unknown>): void => {
  console.log(`\n## ${section}`);
  for (const [k, v] of Object.entries(facts)) {
    console.log(`  ${k} = ${JSON.stringify(v)}`);
  }
};

function counting<T extends object>(target: T): {
  bag: T;
  gets: Record<string, number>;
  has: Record<string, number>;
} {
  const gets: Record<string, number> = {};
  const has: Record<string, number> = {};
  const bag = new Proxy(target, {
    get(t, k, rcv): unknown {
      if (typeof k === "string") gets[k] = (gets[k] ?? 0) + 1;
      return Reflect.get(t, k, rcv);
    },
    has(t, k): boolean {
      if (typeof k === "string") has[k] = (has[k] ?? 0) + 1;
      return Reflect.has(t, k);
    },
  }) as T;
  return { bag, gets, has };
}

const mkRouter = () => createRouter(ROUTES, { defaultRoute: "a" });

async function main(): Promise<void> {
  // ---------------------------------------------------------------- A: makeState·search
  {
    const r = mkRouter();
    await r.start("/a");
    const api = getPluginApi(r);
    const s = counting({ tab: "x" });
    const st = api.makeState("u", { id: "1" }, s.bag);
    out("A · PluginApi.makeState·search", {
      searchKeyReads: s.gets,
      landedValue: st.search.tab,
      stateSearchIsCallerBag: st.search === (s.bag as unknown),
      stateSearchFrozen: Object.isFrozen(st.search),
    });
    r.stop();
  }

  // ------------------------------------------------- B: buildNavigationState·search
  {
    const r = mkRouter();
    await r.start("/a");
    const api = getPluginApi(r);
    const s = counting({ tab: "y" });
    const st = api.buildNavigationState("u", { id: "2" }, s.bag) as State;
    out("B · PluginApi.buildNavigationState·search", {
      searchKeyReads: s.gets,
      landedValue: st.search.tab,
      stateSearchIsCallerBag: st.search === (s.bag as unknown),
      path: st.path,
    });
    r.stop();
  }

  // ------------------------------------------- C: RouterInternals.makeState·search
  {
    const r = mkRouter();
    await r.start("/a");
    const ctx = getInternals(r);
    const s = counting({ tab: "z" });
    const st = ctx.makeState("u", { id: "3" }, s.bag);
    out("C · RouterInternals.makeState·search", {
      searchKeyReads: s.gets,
      landedValue: st.search.tab,
      stateSearchIsCallerBag: st.search === (s.bag as unknown),
    });
    r.stop();
  }

  // -------------------------------------------------------- D: Router.navigate·options
  {
    const r = mkRouter();
    await r.start("/a");
    const ac = new AbortController();
    let hookOpts: unknown;
    r.usePlugin(() => ({
      onTransitionSuccess: (_t, _f, opts) => {
        hookOpts = opts;
      },
    }));
    const o = counting({ replace: true, marker: "m", signal: ac.signal });
    await r.navigate("b", {}, {}, o.bag);
    out("D · Router.navigate·options", {
      optsKeyReads: o.gets,
      hookOptsIsCallerBag: hookOpts === (o.bag as unknown),
      hookOptsFrozen: Object.isFrozen(hookOpts),
      hookOptsKeys: Object.keys(hookOpts as object),
      signalWithheldFromCopy: !("signal" in (hookOpts as object)),
      markerSurvives: (hookOpts as Record<string, unknown>).marker,
    });
    const before = JSON.stringify(o.gets);
    await r.navigate("a");
    out("D2 · читается ли мешок вызывающего на СЛЕДУЮЩЕЙ навигации", {
      readsUnchanged: JSON.stringify(o.gets) === before,
      gets: o.gets,
    });
    r.stop();
  }

  // ------------------------------------------------- E: Router.navigateToDefault·options
  {
    const r = mkRouter();
    await r.start("/b");
    let hookOpts: unknown;
    r.usePlugin(() => ({
      onTransitionSuccess: (_t, _f, opts) => {
        hookOpts = opts;
      },
    }));
    const o = counting({ replace: true, marker: "nd" });
    await r.navigateToDefault(o.bag);
    out("E · Router.navigateToDefault·options", {
      optsKeyReads: o.gets,
      committedName: r.getState()?.name,
      hookOptsIsCallerBag: hookOpts === (o.bag as unknown),
      hookOptsFrozen: Object.isFrozen(hookOpts),
      markerSurvives: (hookOpts as Record<string, unknown>).marker,
    });
    r.stop();
  }

  // ----------------------------- F: PluginApi.navigateToState·options / ·state / ·state.context
  {
    const r = mkRouter();
    await r.start("/a");
    const api = getPluginApi(r);
    let hookOpts: unknown;
    r.usePlugin(() => ({
      onTransitionSuccess: (_t, _f, opts) => {
        hookOpts = opts;
      },
    }));
    const ac = new AbortController();
    const o = counting({ replace: true, marker: "p", signal: ac.signal });
    const base = api.makeState("u", { id: "9" }, { tab: "t" }, "/u/9?tab=t");
    const callerParams = counting({ id: "9" });
    const callerSearch = counting({ tab: "t" });
    const callerContext = { ns: { v: 1 } };
    const shell = counting({
      name: "u",
      params: callerParams.bag,
      search: callerSearch.bag,
      path: base.path,
      context: callerContext,
      transition: base.transition,
    });
    const committed = await api.navigateToState(shell.bag as State, o.bag);
    out("F · PluginApi.navigateToState·state / ·options", {
      shellSlotReads: shell.gets,
      paramsKeyReads: callerParams.gets,
      searchKeyReads: callerSearch.gets,
      landedParamId: committed.params.id,
      committedIsGetState: committed === r.getState(),
      committedParamsIsCallerBag:
        committed.params === (callerParams.bag as unknown),
      committedSearchIsCallerBag:
        committed.search === (callerSearch.bag as unknown),
      committedContextIsCallerContext:
        committed.context === (callerContext as unknown),
      committedContextNsIsCallerNs:
        (committed.context as Record<string, unknown>).ns === callerContext.ns,
      committedTransitionIsCallerTransition:
        committed.transition === (base.transition as unknown),
      optsKeyReads: o.gets,
      hookOptsIsCallerBag: hookOpts === (o.bag as unknown),
      hookOptsFrozen: Object.isFrozen(hookOpts),
      hookOptsKeys: Object.keys(hookOpts as object),
    });
    r.stop();
  }

  // ------------------------------------- G: RouterInternals.navigateToState·state
  {
    const r = mkRouter();
    await r.start("/a");
    const ctx = getInternals(r);
    const base = ctx.makeState("u", { id: "7" }, { tab: "q" }, "/u/7?tab=q");
    const callerParams = counting({ id: "7" });
    const callerContext = { ns: 1 };
    const shell = counting({
      name: "u",
      params: callerParams.bag,
      search: { tab: "q" },
      path: base.path,
      context: callerContext,
      transition: base.transition,
    });
    const committed = await ctx.navigateToState(shell.bag as State);
    out("G · RouterInternals.navigateToState·state", {
      shellSlotReads: shell.gets,
      paramsKeyReads: callerParams.gets,
      landedParamId: committed.params.id,
      committedParamsIsCallerBag:
        committed.params === (callerParams.bag as unknown),
      committedContextIsCallerContext:
        committed.context === (callerContext as unknown),
    });
    r.stop();
  }

  // ---------------------------- H: RouterInternals.systemCommit·toState / ·toState.transition
  {
    const r = mkRouter();
    await r.start("/a");
    const ctx = getInternals(r);
    const segments = { deactivated: [], activated: [], intersection: "" };
    const callerTransition = counting({
      phase: "activating",
      reason: "success",
      segments,
    });
    const callerParams = counting({ id: "5" });
    const callerContext = { ns: 2 };
    const shell = counting({
      name: "u",
      params: callerParams.bag,
      search: { tab: "s" },
      path: "/u/5?tab=s",
      context: callerContext,
      transition: callerTransition.bag,
    });
    const committed = ctx.systemCommit(
      shell.bag as unknown as State,
      r.getState(),
      {},
    );
    out("H · RouterInternals.systemCommit·toState / ·toState.transition", {
      shellSlotReads: shell.gets,
      transitionKeyReads: callerTransition.gets,
      paramsKeyReads: callerParams.gets,
      landedParamId: committed.params.id,
      committedIsGetState: committed === r.getState(),
      committedParamsIsCallerBag:
        committed.params === (callerParams.bag as unknown),
      committedContextIsCallerContext:
        committed.context === (callerContext as unknown),
      committedTransitionIsCallerBag:
        committed.transition === (callerTransition.bag as unknown),
      committedSegmentsIsCallerSegments:
        committed.transition.segments === segments,
      coreFrozeCallerSegments: Object.isFrozen(segments),
      committedTransitionFrozen: Object.isFrozen(committed.transition),
    });
    r.stop();
  }
}

void main();
