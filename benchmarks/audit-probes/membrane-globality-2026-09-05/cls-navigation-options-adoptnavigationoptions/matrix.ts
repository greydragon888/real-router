// Матрица семейства «navigation-options·adoptNavigationOptions».
// Строки — двери (navigate·options, navigateToDefault·options,
// PluginApi.navigateToState·options, RouterInternals.navigateToState·options,
// RouterInternals.systemCommit·opts). Столбцы — эксперимент (а), P1, P2, P3, P4.
//
// ⚑ Шапка S0 — позитивные контроли инструмента: без них ни один ноль ниже не
// читается. Каждая секция дополнительно печатает признак того, что вход ДОШЁЛ
// до проверяемой ветки (навигация состоялась / хук выстрелил / ключ долетел).
//
// Run: cd W/benchmarks && NODE_OPTIONS='--conditions=@real-router/internal-source' \
//   npx tsx audit-probes/membrane-globality-2026-09-05/cls-navigation-options-adoptnavigationoptions/matrix.ts
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import {
  countingBag,
  countingProxy,
  driftingBag,
} from "../../../../packages/core/tests/helpers/hostileBags";

import type { State, NavigationOptions } from "@real-router/core/types";

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

const mkRouter = () => createRouter(ROUTES, { defaultRoute: "a" });

/** Мелкая копия контейнера: новый объект, листья — те же ссылки. */
const shallow = <T extends object>(o: T): T => ({ ...o }) as T;

/** Лгущий Proxy #1854: ownKeys НЕ называет ключ, gOPD утверждает, что он свой. */
function lyingProxy(
  visible: Record<string, unknown>,
  hidden: Record<string, unknown>,
): NavigationOptions {
  const all = { ...visible, ...hidden };

  return new Proxy(all, {
    ownKeys: () => Object.keys(visible),
    getOwnPropertyDescriptor(_t, k) {
      return {
        value: (all as Record<string, unknown>)[k as string],
        writable: true,
        enumerable: true,
        configurable: true,
      };
    },
    get: (t, k, r) => Reflect.get(t, k, r),
    has: (_t, k) => (k as string) in all,
  }) as unknown as NavigationOptions;
}

/** Хук-наблюдатель: ловит третий аргумент onTransitionSuccess. */
function watchHook(r: ReturnType<typeof mkRouter>): {
  last: () => unknown;
  count: () => number;
} {
  let last: unknown;
  let n = 0;
  r.usePlugin(() => ({
    onTransitionSuccess: (
      _t: State,
      _f: State | undefined,
      opts?: NavigationOptions,
    ) => {
      last = opts;
      n++;
    },
  }));

  return { last: () => last, count: () => n };
}

async function main(): Promise<void> {
  // ================================================================= S0 controls
  {
    const r = mkRouter();
    const h = watchHook(r);
    await r.start("/a");
    const legal = { replace: true, marker: "ok" };
    const st = await r.navigate("b", {}, {}, legal as NavigationOptions);
    out("S0 · позитивные контроли инструмента", {
      controlNavigated: st.name,
      controlHookFired: h.count(),
      controlHookGotOpts: h.last() !== undefined,
      controlMarkerReachedHook: (h.last() as Record<string, unknown>).marker,
      controlLegalBagNotFrozen: Object.isFrozen(legal),
      controlHookOptsFrozen: Object.isFrozen(h.last()),
      "control · countingProxy инструмент работает": (() => {
        const p = countingProxy({ x: 1 });
        void (p.bag as Record<string, unknown>).x;

        return p.reads;
      })(),
    });
    r.stop();
  }

  // ============================================ A1 · Router.navigate·options
  {
    const runArm = async (pre: boolean) => {
      const r = mkRouter();
      const h = watchHook(r);
      await r.start("/a");
      const leaf = { deep: 1 };
      const ac = new AbortController();
      const original: Record<string, unknown> = {
        replace: true,
        marker: "m",
        nested: leaf,
        signal: ac.signal,
      };
      const handed = pre ? shallow(original) : original;
      const st = await r.navigate("b", {}, {}, handed as NavigationOptions);
      const hookOpts = h.last() as Record<string, unknown>;
      const res = {
        name: st.name,
        path: r.buildPath("b", {}),
        transitionPhase: r.getState()?.transition?.phase,
        hookKeys: Object.keys(hookOpts),
        hookFrozen: Object.isFrozen(hookOpts),
        hookIsHanded: (hookOpts as unknown) === (handed as unknown),
        hookIsOriginal: (hookOpts as unknown) === (original as unknown),
        hookNestedIsLeaf: hookOpts.nested === leaf,
        hookHasSignal: "signal" in hookOpts,
        marker: hookOpts.marker,
        nestedFrozenAfter: Object.isFrozen(leaf),
        originalFrozenAfter: Object.isFrozen(original),
        stateJson: JSON.stringify(r.getState()),
        backVisible_originalToHook: (() => {
          original.marker = "MUTATED";

          return (h.last() as Record<string, unknown>).marker;
        })(),
      };
      r.stop();

      return res;
    };

    const orig = await runArm(false);
    const copy = await runArm(true);
    out("A1 · Router.navigate·options — эксперимент (а)", {
      armOriginal: orig,
      armPreCopied: copy,
      allObservablesIdentical: JSON.stringify(orig) === JSON.stringify(copy),
    });
  }

  // ------------------------------------------------------------ A1 · P1 / P4
  {
    const r = mkRouter();
    const h = watchHook(r);
    await r.start("/a");
    const leaf = { deep: 1 };
    const ac = new AbortController();
    const drift = driftingBag(
      { replace: true, marker: "first", nested: leaf, signal: ac.signal },
      { marker: "DRIFT-second-read", replace: false },
    );
    const st = await r.navigate("b", {}, {}, drift.bag as NavigationOptions);
    const hookOpts = h.last() as Record<string, unknown>;
    out("A1 · P1 (дрейфующий вход) + P4", {
      readsPerKey: { ...drift.reads },
      reachedBranch_navigated: st.name,
      landedMarker_isFirstRead: hookOpts.marker,
      landedReplace_isFirstRead: hookOpts.replace,
      P4_coreLevelFrozen: Object.isFrozen(hookOpts),
      P4_callerNestedNotFrozen: !Object.isFrozen(leaf),
      P4_control_nestedIsSameObject: hookOpts.nested === leaf,
    });
    const before = JSON.stringify(drift.reads);
    await r.navigate("a");
    out("A1 · P1b — читается ли мешок вызывающего на СЛЕДУЮЩЕЙ навигации", {
      readsUnchanged: JSON.stringify(drift.reads) === before,
      reads: { ...drift.reads },
    });
    r.stop();
  }

  // ------------------------------------------------------------ A1 · P2 (#1854)
  {
    const r = mkRouter();
    const h = watchHook(r);
    await r.start("/a");
    const bag = lyingProxy(
      { marker: "visible" },
      { sneaky: "HIDDEN", replace: true },
    );
    const st = await r.navigate("b", {}, {}, bag);
    const hookOpts = h.last() as Record<string, unknown>;
    out("A1 · P2 — лгущий Proxy (ownKeys молчит, gOPD утверждает «свой»)", {
      reachedBranch_navigated: st.name,
      hookKeys: Object.keys(hookOpts),
      P2_sneakyLanded: "sneaky" in hookOpts,
      P2_replaceLanded: "replace" in hookOpts,
      positiveControl_visibleLanded: hookOpts.marker,
    });
    r.stop();
  }

  // ------------------------------------------------------------ A1 · P3
  {
    const r = mkRouter();
    const h = watchHook(r);
    await r.start("/a");
    let setterHits = 0;
    let threw: string | undefined;
    let hookOpts: Record<string, unknown> = {};
    Object.defineProperty(Object.prototype, "marker", {
      configurable: true,
      get(): unknown {
        return undefined;
      },
      set(): void {
        setterHits++;
      },
    });
    try {
      await r.navigate("b", {}, {}, {
        marker: "via-define",
        replace: true,
      } as NavigationOptions);
      hookOpts = h.last() as Record<string, unknown>;
    } catch (e) {
      threw = String(e);
    } finally {
      delete (Object.prototype as Record<string, unknown>).marker;
    }

    const poisoned = JSON.parse(
      '{"__proto__":{"pwned":1},"replace":true,"marker":"pp"}',
    ) as NavigationOptions;
    const st2 = await r.navigate("a", {}, {}, poisoned);
    const hook2 = h.last() as Record<string, unknown>;
    out("A1 · P3 — унаследованный сеттер + собственный __proto__", {
      P3_inheritedSetterHits: setterHits,
      P3_threw: threw,
      P3_ownMarkerOnCopy: Object.hasOwn(hookOpts, "marker"),
      P3_markerValue: hookOpts.marker,
      reachedBranch2_navigated: st2.name,
      P3_protoKeyCarried: Object.hasOwn(hook2, "__proto__"),
      P3_prototypeSwapped: Object.getPrototypeOf(hook2) !== Object.prototype,
      P3_globalPwned: ({} as Record<string, unknown>).pwned !== undefined,
      positiveControl_markerLanded2: hook2.marker,
    });
    r.stop();
  }

  // ==================================== A2 · Router.navigateToDefault·options
  {
    const runArm = async (pre: boolean) => {
      const r = mkRouter();
      const h = watchHook(r);
      await r.start("/b");
      const leaf = { deep: 2 };
      const original: Record<string, unknown> = {
        replace: true,
        marker: "nd",
        nested: leaf,
      };
      const handed = pre ? shallow(original) : original;
      await r.navigateToDefault(handed as NavigationOptions);
      const hookOpts = h.last() as Record<string, unknown>;
      const res = {
        committed: r.getState()?.name,
        hookKeys: Object.keys(hookOpts),
        hookFrozen: Object.isFrozen(hookOpts),
        hookIsHanded: (hookOpts as unknown) === (handed as unknown),
        hookNestedIsLeaf: hookOpts.nested === leaf,
        nestedFrozenAfter: Object.isFrozen(leaf),
        marker: hookOpts.marker,
      };
      r.stop();

      return res;
    };
    const orig = await runArm(false);
    const copy = await runArm(true);
    out("A2 · navigateToDefault·options — эксперимент (а)", {
      armOriginal: orig,
      armPreCopied: copy,
      allObservablesIdentical: JSON.stringify(orig) === JSON.stringify(copy),
    });
  }
  {
    const r = mkRouter();
    const h = watchHook(r);
    await r.start("/b");
    const leaf = { deep: 2 };
    const drift = driftingBag(
      { replace: true, marker: "first", nested: leaf },
      { marker: "DRIFT" },
    );
    await r.navigateToDefault(drift.bag as NavigationOptions);
    const hookOpts = h.last() as Record<string, unknown>;
    const committedAfterDrift = r.getState()?.name;
    const lie = lyingProxy({ marker: "v" }, { sneaky: "H" });
    await r.navigate("b");
    await r.navigateToDefault(lie);
    const hook2 = h.last() as Record<string, unknown>;
    out("A2 · P1/P2/P4", {
      readsPerKey: { ...drift.reads },
      reachedBranch_committed: committedAfterDrift,
      landedMarker: hookOpts.marker,
      P4_coreLevelFrozen: Object.isFrozen(hookOpts),
      P4_callerNestedNotFrozen: !Object.isFrozen(leaf),
      P2_sneakyLanded: "sneaky" in hook2,
      P2_control_visibleLanded: hook2.marker,
    });
    r.stop();
  }

  // ================================= A3 · PluginApi.navigateToState·options
  {
    const runArm = async (pre: boolean) => {
      const r = mkRouter();
      const h = watchHook(r);
      await r.start("/a");
      const api = getPluginApi(r);
      const leaf = { deep: 3 };
      const ac = new AbortController();
      const original: Record<string, unknown> = {
        replace: true,
        marker: "p",
        nested: leaf,
        signal: ac.signal,
      };
      const handed = pre ? shallow(original) : original;
      const base = api.makeState("u", { id: "9" }, { tab: "t" }, "/u/9?tab=t");
      const committed = await api.navigateToState(
        base,
        handed as NavigationOptions,
      );
      const hookOpts = h.last() as Record<string, unknown>;
      const res = {
        committedName: committed.name,
        committedIsGetState: committed === r.getState(),
        hookKeys: Object.keys(hookOpts),
        hookFrozen: Object.isFrozen(hookOpts),
        hookIsHanded: (hookOpts as unknown) === (handed as unknown),
        hookHasSignal: "signal" in hookOpts,
        hookNestedIsLeaf: hookOpts.nested === leaf,
        nestedFrozenAfter: Object.isFrozen(leaf),
        marker: hookOpts.marker,
      };
      r.stop();

      return res;
    };
    const orig = await runArm(false);
    const copy = await runArm(true);
    out("A3 · PluginApi.navigateToState·options — эксперимент (а)", {
      armOriginal: orig,
      armPreCopied: copy,
      allObservablesIdentical: JSON.stringify(orig) === JSON.stringify(copy),
    });
  }
  {
    const r = mkRouter();
    const h = watchHook(r);
    await r.start("/a");
    const api = getPluginApi(r);
    const leaf = { deep: 3 };
    const ac = new AbortController();
    const drift = driftingBag(
      { replace: true, marker: "first", nested: leaf, signal: ac.signal },
      { marker: "DRIFT", replace: false },
    );
    const base = api.makeState("u", { id: "9" }, { tab: "t" }, "/u/9?tab=t");
    const committed = await api.navigateToState(
      base,
      drift.bag as NavigationOptions,
    );
    const hookOpts = h.last() as Record<string, unknown>;
    const lie = lyingProxy({ marker: "v" }, { sneaky: "H", replace: true });
    const base2 = api.makeState("b", {}, {}, "/b");
    await api.navigateToState(base2, lie);
    const hook2 = h.last() as Record<string, unknown>;
    out("A3 · P1/P2/P4", {
      readsPerKey: { ...drift.reads },
      reachedBranch_committed: committed.name,
      landedMarker: hookOpts.marker,
      landedReplace: hookOpts.replace,
      P4_coreLevelFrozen: Object.isFrozen(hookOpts),
      P4_callerNestedNotFrozen: !Object.isFrozen(leaf),
      P2_sneakyLanded: "sneaky" in hook2,
      P2_control_visibleLanded: hook2.marker,
    });
    r.stop();
  }

  // ============================ A4 · RouterInternals.navigateToState·options
  {
    const runArm = async (pre: boolean) => {
      const r = mkRouter();
      const h = watchHook(r);
      await r.start("/a");
      const ctx = getInternals(r);
      const leaf = { deep: 4 };
      const ac = new AbortController();
      const original: Record<string, unknown> = {
        replace: true,
        marker: "i",
        nested: leaf,
        signal: ac.signal,
      };
      const handed = pre ? shallow(original) : original;
      const base = ctx.makeState("u", { id: "7" }, { tab: "q" }, "/u/7?tab=q");
      const committed = await ctx.navigateToState(
        base,
        handed as NavigationOptions,
      );
      const hookOpts = h.last() as Record<string, unknown>;
      const res = {
        committedName: committed.name,
        hookKeys: Object.keys(hookOpts),
        hookFrozen: Object.isFrozen(hookOpts),
        hookIsHanded: (hookOpts as unknown) === (handed as unknown),
        hookHasSignal: "signal" in hookOpts,
        hookNestedIsLeaf: hookOpts.nested === leaf,
        nestedFrozenAfter: Object.isFrozen(leaf),
        marker: hookOpts.marker,
      };
      r.stop();

      return res;
    };
    const orig = await runArm(false);
    const copy = await runArm(true);
    out("A4 · RouterInternals.navigateToState·options — эксперимент (а)", {
      armOriginal: orig,
      armPreCopied: copy,
      allObservablesIdentical: JSON.stringify(orig) === JSON.stringify(copy),
    });
  }
  {
    const r = mkRouter();
    const h = watchHook(r);
    await r.start("/a");
    const ctx = getInternals(r);
    const leaf = { deep: 4 };
    const drift = driftingBag(
      { replace: true, marker: "first", nested: leaf },
      { marker: "DRIFT" },
    );
    const base = ctx.makeState("u", { id: "7" }, { tab: "q" }, "/u/7?tab=q");
    const committed = await ctx.navigateToState(
      base,
      drift.bag as NavigationOptions,
    );
    const hookOpts = h.last() as Record<string, unknown>;
    const lie = lyingProxy({ marker: "v" }, { sneaky: "H" });
    const base2 = ctx.makeState("b", {}, {}, "/b");
    await ctx.navigateToState(base2, lie);
    const hook2 = h.last() as Record<string, unknown>;
    out("A4 · P1/P2/P4", {
      readsPerKey: { ...drift.reads },
      reachedBranch_committed: committed.name,
      landedMarker: hookOpts.marker,
      P4_coreLevelFrozen: Object.isFrozen(hookOpts),
      P4_callerNestedNotFrozen: !Object.isFrozen(leaf),
      P2_sneakyLanded: "sneaky" in hook2,
      P2_control_visibleLanded: hook2.marker,
    });
    r.stop();
  }

  // ============================== A5 · RouterInternals.systemCommit·opts
  {
    const runArm = async (pre: boolean) => {
      const r = mkRouter();
      const h = watchHook(r);
      await r.start("/a");
      const ctx = getInternals(r);
      const leaf = { deep: 5 };
      const original: Record<string, unknown> = {
        replace: true,
        marker: "sc",
        nested: leaf,
      };
      const handed = pre ? shallow(original) : original;
      const shell = ctx.makeState("b", {}, {}, "/b");
      const committed = ctx.systemCommit(
        shell,
        r.getState(),
        handed as NavigationOptions,
      );
      const hookOpts = h.last() as Record<string, unknown>;
      const res = {
        committedName: committed.name,
        committedIsGetState: committed === r.getState(),
        hookFired: h.count(),
        hookIsHanded: (hookOpts as unknown) === (handed as unknown),
        hookFrozen: Object.isFrozen(hookOpts),
        hookKeys: Object.keys(hookOpts),
        marker: hookOpts.marker,
        hookNestedIsLeaf: hookOpts.nested === leaf,
        nestedFrozenAfter: Object.isFrozen(leaf),
        originalFrozenAfter: Object.isFrozen(original),
        backVisible_originalToHook: (() => {
          original.marker = "MUT-ORIG";

          return (h.last() as Record<string, unknown>).marker;
        })(),
        backVisible_hookToOriginal: (() => {
          try {
            (h.last() as Record<string, unknown>).viaHook = "MUT-HOOK";
          } catch {
            return "throw (frozen)";
          }

          return original.viaHook;
        })(),
      };
      r.stop();

      return res;
    };
    const orig = await runArm(false);
    const copy = await runArm(true);
    out("A5 · systemCommit·opts — эксперимент (а)", {
      armOriginal: orig,
      armPreCopied: copy,
      allObservablesIdentical: JSON.stringify(orig) === JSON.stringify(copy),
    });
  }
  {
    const r = mkRouter();
    const h = watchHook(r);
    await r.start("/a");
    const ctx = getInternals(r);
    const leaf = { deep: 5 };
    const probe = countingBag({ replace: true, marker: "sc", nested: leaf });
    const shell = ctx.makeState("b", {}, {}, "/b");
    const committed = ctx.systemCommit(
      shell,
      r.getState(),
      probe.bag as NavigationOptions,
    );
    const readsBeforeHookTouch = { ...probe.reads };
    const hookOpts = h.last() as Record<string, unknown>;
    const sameObject = (hookOpts as unknown) === (probe.bag as unknown);
    out("A5 · P1–P4 на транзитной арке", {
      reachedBranch_committed: committed.name,
      hookFired: h.count(),
      coreReadsPerKey: readsBeforeHookTouch,
      hookGotCallerBagByReference: sameObject,
      hookOptsFrozen: Object.isFrozen(hookOpts),
      P4_callerNestedNotFrozen: !Object.isFrozen(leaf),
      positiveControl_markerReadableFromHook: hookOpts.marker,
      readsAfterHookRead: { ...probe.reads },
    });
    r.stop();
  }

  // ===================== A6 · тот же мешок под validation-plugin (двойное чтение)
  {
    const mod = (await import(
      "../../../../packages/validation-plugin/src/index"
    )) as Record<string, unknown>;
    const factory = (mod.validationPlugin ??
      mod.default) as unknown as () => unknown;
    const r = mkRouter();
    const h = watchHook(r);
    r.usePlugin(factory as never);
    await r.start("/a");
    const drift = driftingBag(
      { replace: true, marker: "first" },
      { replace: false, marker: "DRIFT-second-read" },
    );
    const st = await r.navigate("b", {}, {}, drift.bag as NavigationOptions);
    const hookOpts = h.last() as Record<string, unknown>;
    out("A6 · Router.navigate·options ПОД validation-plugin", {
      exportsSeen: Object.keys(mod),
      reachedBranch_navigated: st.name,
      readsPerKey: { ...drift.reads },
      landedMarker: hookOpts.marker,
      landedReplace: hookOpts.replace,
      note: "validateNavigationOptions читает мешок ДО adoptNavigationOptions",
    });
    r.stop();
  }
}

void main();
