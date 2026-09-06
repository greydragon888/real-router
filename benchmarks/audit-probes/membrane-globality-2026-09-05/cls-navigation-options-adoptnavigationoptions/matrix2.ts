// Матрица семейства «navigation-options·adoptNavigationOptions», часть 2.
// B1 — A6 первой части, починенная (validationPlugin() возвращает фабрику).
// B2 — P2/P3 на ТРАНЗИТНОЙ арке systemCommit (доказательство вакуума: ядро
//      не перечисляет и не пишет мешок вовсе).
// B3 — цена копии на арке systemCommit (alreadyCopied = no): A/B + A/A-пол.
//
// Run: cd W/benchmarks && NODE_OPTIONS='--conditions=@real-router/internal-source' \
//   npx tsx audit-probes/membrane-globality-2026-09-05/cls-navigation-options-adoptnavigationoptions/matrix2.ts
import { createRouter } from "@real-router/core";
import { getInternals } from "@real-router/core/validation";

import { validationPlugin } from "../../../../packages/validation-plugin/src/index";
import { adoptNavigationOptions } from "../../../../packages/core/src/helpers";
import {
  countingBag,
  driftingBag,
} from "../../../../packages/core/tests/helpers/hostileBags";

import type { State, NavigationOptions } from "@real-router/core/types";

const ROUTES = [
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
] as never;

const out = (section: string, facts: Record<string, unknown>): void => {
  console.log(`\n## ${section}`);
  for (const [k, v] of Object.entries(facts)) {
    console.log(`  ${k} = ${JSON.stringify(v)}`);
  }
};

const mkRouter = () => createRouter(ROUTES, { defaultRoute: "a" });

function watchHook(r: ReturnType<typeof mkRouter>) {
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

function lyingProxy(
  visible: Record<string, unknown>,
  hidden: Record<string, unknown>,
): NavigationOptions {
  const all = { ...visible, ...hidden };

  return new Proxy(all, {
    ownKeys: () => Object.keys(visible),
    getOwnPropertyDescriptor(_t, k) {
      return {
        value: all[k as string],
        writable: true,
        enumerable: true,
        configurable: true,
      };
    },
  }) as unknown as NavigationOptions;
}

async function main(): Promise<void> {
  // ============================ B1 · navigate·options ПОД validation-plugin
  {
    const r = mkRouter();
    const h = watchHook(r);
    r.usePlugin(validationPlugin());
    await r.start("/a");
    const drift = driftingBag(
      { replace: true, marker: "first" },
      { replace: false, marker: "DRIFT-second-read" },
    );
    const st = await r.navigate("b", {}, {}, drift.bag as NavigationOptions);
    const hookOpts = h.last() as Record<string, unknown>;
    out("B1 · navigate·options ПОД validation-plugin (P1 с плагином)", {
      reachedBranch_navigated: st.name,
      readsPerKey: { ...drift.reads },
      landedMarker: hookOpts.marker,
      landedReplace: hookOpts.replace,
      hookOptsIsCallerBag: (hookOpts as unknown) === (drift.bag as unknown),
      hookOptsFrozen: Object.isFrozen(hookOpts),
    });

    // Контроль: тот же прогон БЕЗ плагина — сколько чтений у тех же ключей.
    const r2 = mkRouter();
    const h2 = watchHook(r2);
    await r2.start("/a");
    const drift2 = driftingBag(
      { replace: true, marker: "first" },
      { replace: false, marker: "DRIFT-second-read" },
    );
    const st2 = await r2.navigate("b", {}, {}, drift2.bag as NavigationOptions);
    out("B1-control · тот же вход БЕЗ validation-plugin", {
      reachedBranch_navigated: st2.name,
      readsPerKey: { ...drift2.reads },
      landedMarker: (h2.last() as Record<string, unknown>).marker,
    });
    r.stop();
    r2.stop();
  }

  // ============================ B2 · P2/P3 на транзитной арке systemCommit
  {
    const r = mkRouter();
    const h = watchHook(r);
    await r.start("/a");
    const ctx = getInternals(r);

    // P2 — лгущий Proxy: ядро не перечисляет мешок вовсе, значит скрытый ключ
    // не «попадает в состояние» и не отсекается — он доезжает по ссылке.
    const lie = lyingProxy({ marker: "v" }, { sneaky: "HIDDEN" });
    const c1 = ctx.systemCommit(
      ctx.makeState("b", {}, {}, "/b"),
      r.getState(),
      lie,
    );
    const hook1 = h.last() as Record<string, unknown>;
    out("B2 · P2 на systemCommit·opts (лгущий Proxy)", {
      reachedBranch_committed: c1.name,
      hookGotSameProxy: (hook1 as unknown) === (lie as unknown),
      hookOwnKeys: Object.keys(hook1),
      sneakyReachableFromHook: hook1.sneaky,
      note: "ядро не перечисляет — фильтра нет, объект доезжает как есть",
    });

    // P3 — унаследованный сеттер + собственный __proto__ из JSON.parse.
    let setterHits = 0;
    let threw: string | undefined;
    Object.defineProperty(Object.prototype, "marker", {
      configurable: true,
      get(): unknown {
        return undefined;
      },
      set(): void {
        setterHits++;
      },
    });
    let committedName = "";
    try {
      const c2 = ctx.systemCommit(
        ctx.makeState("a", {}, {}, "/a"),
        r.getState(),
        { marker: "via-define", replace: true } as NavigationOptions,
      );
      committedName = c2.name;
    } catch (e) {
      threw = String(e);
    } finally {
      delete (Object.prototype as Record<string, unknown>).marker;
    }

    const poisoned = JSON.parse(
      '{"__proto__":{"pwned":1},"replace":true,"marker":"pp"}',
    ) as NavigationOptions;
    const c3 = ctx.systemCommit(
      ctx.makeState("b", {}, {}, "/b"),
      r.getState(),
      poisoned,
    );
    const hook3 = h.last() as Record<string, unknown>;
    out("B2 · P3 на systemCommit·opts", {
      P3_inheritedSetterHits: setterHits,
      P3_threw: threw,
      reachedBranch_committed: committedName,
      reachedBranch_committed3: c3.name,
      P3_hookIsPoisonedBag: (hook3 as unknown) === (poisoned as unknown),
      P3_ownProtoOnHookBag: Object.hasOwn(hook3, "__proto__"),
      P3_globalPwned: ({} as Record<string, unknown>).pwned !== undefined,
      P3_committedStateProtoOk: Object.getPrototypeOf(c3) === Object.prototype,
      positiveControl_markerReadable: hook3.marker,
    });

    // P1 — счёт чтений ядром на этой арке (ожидание: ноль).
    const probe = countingBag({ replace: true, marker: "sc" });
    const c4 = ctx.systemCommit(
      ctx.makeState("a", {}, {}, "/a"),
      r.getState(),
      probe.bag as NavigationOptions,
    );
    out("B2 · P1 на systemCommit·opts", {
      reachedBranch_committed: c4.name,
      coreReadsPerKey: { ...probe.reads },
      hookFired: h.count(),
    });
    r.stop();
  }

  // ============================ B3 · цена копии на арке systemCommit
  {
    const { measure } = (await import("mitata")) as unknown as {
      measure: (
        fn: () => unknown,
        opts?: unknown,
      ) => Promise<{ avg: number; p50: number }>;
    };

    const r = mkRouter();
    await r.start("/a");
    const ctx = getInternals(r);
    // Реальная форма мешка этой двери: собственные вызывающие ядра подают
    // FROZEN_REPLACE_OPTS / REVALIDATE_OPTS — один-два ключа, frozen.
    const OPTS = Object.freeze({
      replace: true,
      force: true,
    }) as NavigationOptions;
    const sA = ctx.makeState("a", {}, {}, "/a");
    const sB = ctx.makeState("b", {}, {}, "/b");
    let flip = false;

    const baseline = (): unknown => {
      flip = !flip;

      return ctx.systemCommit(flip ? sB : sA, r.getState(), OPTS);
    };
    const withCopy = (): unknown => {
      flip = !flip;

      return ctx.systemCommit(
        flip ? sB : sA,
        r.getState(),
        adoptNavigationOptions(OPTS),
      );
    };

    // Прогрев
    for (let i = 0; i < 20_000; i++) {
      baseline();
      withCopy();
    }

    const bases: number[] = [];
    const copies: number[] = [];
    const aa: number[] = [];
    for (let round = 0; round < 5; round++) {
      bases.push((await measure(baseline)).avg);
      copies.push((await measure(withCopy)).avg);
      aa.push((await measure(baseline)).avg);
    }
    const med = (xs: number[]): number => [...xs].sort((x, y) => x - y)[2]!;
    const b = med(bases);
    const c = med(copies);
    const a2 = med(aa);
    out("B3 · цена adoptNavigationOptions на арке systemCommit", {
      harness:
        "mitata 1.0.34 · measure().avg · 5 чередующихся раундов · медиана",
      shape:
        "Object.freeze({ replace: true, force: true }) — форма FROZEN_REPLACE_OPTS/REVALIDATE_OPTS",
      baselineNs: Number(b.toFixed(2)),
      withCopyNs: Number(c.toFixed(2)),
      deltaPct: Number((((c - b) / b) * 100).toFixed(2)),
      aaFloorPct: Number((((a2 - b) / b) * 100).toFixed(2)),
      rawBases: bases.map((x) => Number(x.toFixed(2))),
      rawCopies: copies.map((x) => Number(x.toFixed(2))),
      rawAA: aa.map((x) => Number(x.toFixed(2))),
    });
    r.stop();
  }
}

void main();
