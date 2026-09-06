// Матрица семейства «валидатор·мешки-опций-навигации» (4 двери).
//
// Двери — контейнер NavigationOptions вызывающего, отданный ПЛАГИННОМУ
// валидатору ДО горла helpers.ts · adoptNavigationOptions:
//   D1 Router.navigate            → validateNavigationOptions(opts, "navigate")
//   D2 Router.navigateToDefault   → validateNavigateToDefaultArgs(options)  (сырой аргумент)
//   D3 Router.navigateToDefault   → validateNavigationOptions(opts, ...)    (второй читатель)
//   D4 PluginApi.navigateToState  → validateNavigationOptions(options, ...)
//
// Инструмент — РЕАЛЬНЫЙ validationPlugin (не подставной валидатор), потому что
// ось семейства — порядковый номер обращения: валидатор читает ключ первым,
// ядро — вторым.
//
// Run: cd W/benchmarks && NODE_OPTIONS='--conditions=@real-router/internal-source' \
//  npx tsx audit-probes/membrane-globality-2026-09-05/cls-валидатор-мешки-опций-навигации/matrix.ts
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
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

/** Наблюдатель: хук получает то, что ядро СЧИТАЛО своим уровнем opts. */
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

  return { last: () => last as Record<string, unknown>, count: () => n };
}

/** Роутер с реальным validation-plugin + хук-наблюдателем, уже стартованный. */
async function freshValidated(start = "/a") {
  const r = mkRouter();
  const h = watchHook(r);
  r.usePlugin(validationPlugin());
  await r.start(start);

  return { r, h };
}

async function freshPlain(start = "/a") {
  const r = mkRouter();
  const h = watchHook(r);
  await r.start(start);

  return { r, h };
}

const fail = (e: unknown): string =>
  `rejected:${(e as { code?: string }).code ?? String(e).slice(0, 70)}`;

/** Ловит и СИНХРОННЫЙ бросок валидатора, и отказ промиса. */
const settleFn = async (f: () => Promise<unknown>): Promise<string> => {
  try {
    await f();

    return "resolved";
  } catch (e) {
    return fail(e);
  }
};

/** Подставной валидатор — только для снятия ИДЕНТИЧНОСТИ аргумента. */
function installSpy(
  router: unknown,
  method: string,
  spy: (args: unknown[]) => void,
): void {
  const validator = new Proxy(
    {},
    {
      get: (_t, group) =>
        new Proxy(
          {},
          {
            get:
              (_t2, m) =>
              (...args: unknown[]) => {
                if (`${String(group)}.${String(m)}` === method) spy(args);
              },
          },
        ),
    },
  );
  (getInternals(router as never) as { validator?: unknown }).validator =
    validator;
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
  // ======================================================= S0 · ПОЗИТИВНЫЕ КОНТРОЛИ
  {
    const { r, h } = await freshValidated();
    // (1) плагин реально стоит И достигается ИМЕННО этой веткой:
    const nonObject = await settleFn(() => 
      r.navigate("b", {}, {}, "nope" as unknown as NavigationOptions),
    );
    // (2) легальный вход тем же кодом доезжает:
    const ok = await r.navigate("b", {}, {}, { replace: true });
    const hookOpts = h.last();
    // (3) контроль без плагина — тот же нелегальный вход НЕ отвергается:
    const { r: rp } = await freshPlain();
    const nonObjectNoPlugin = await settleFn(() => 
      rp.navigate("b", {}, {}, "nope" as unknown as NavigationOptions),
    );
    out("S0 · позитивные контроли", {
      S0_validatorReached_nonObjectRejected: nonObject,
      S0_control_noPlugin_sameInput: nonObjectNoPlugin,
      S0_legalNavigated: ok.name,
      S0_hookFired: h.count(),
      S0_hookGotOpts: hookOpts !== undefined,
      S0_hookOptsFrozen: Object.isFrozen(hookOpts),
      S0_hookOptsReplace: hookOpts.replace,
    });
    r.stop();
    rp.stop();
  }

  // ======================================================= M · МЕХАНИЗМ (что отдано)
  // M1 — идентичность аргумента валидатора на каждой из четырёх дверей.
  {
    const rows: Record<string, unknown> = {};

    // D1
    {
      const r = mkRouter();
      await r.start("/a");
      const bag: NavigationOptions = { replace: true };
      let got: unknown;
      let frozen: unknown;
      installSpy(r, "navigation.validateNavigationOptions", (a) => {
        got = a[0];
        frozen = Object.isFrozen(a[0] as object);
      });
      await r.navigate("b", {}, {}, bag);
      rows.D1_isCallerBag = (got as unknown) === (bag as unknown);
      rows.D1_frozenAtHandout = frozen;
      r.stop();
    }
    // D2 + D3 (одна и та же ссылка, два прохода в одном кадре)
    {
      const r = mkRouter();
      await r.start("/b");
      const bag: NavigationOptions = { replace: true };
      let got2: unknown;
      let got3: unknown;
      const validator = new Proxy(
        {},
        {
          get: (_t, group) =>
            new Proxy(
              {},
              {
                get:
                  (_t2, m) =>
                  (...args: unknown[]) => {
                    const k = `${String(group)}.${String(m)}`;
                    if (k === "navigation.validateNavigateToDefaultArgs")
                      got2 = args[0];
                    if (k === "navigation.validateNavigationOptions")
                      got3 = args[0];
                  },
              },
            ),
        },
      );
      (getInternals(r) as { validator?: unknown }).validator = validator;
      await settleFn(() => r.navigateToDefault(bag));
      rows.D2_isCallerBag = (got2 as unknown) === (bag as unknown);
      rows.D3_isCallerBag = (got3 as unknown) === (bag as unknown);
      rows.D2_D3_sameObject = (got2 as unknown) === (got3 as unknown);
      r.stop();
    }
    // D4
    {
      const r = mkRouter();
      await r.start("/a");
      const api = getPluginApi(r);
      const bag: NavigationOptions = { replace: true };
      let got: unknown;
      let frozen: unknown;
      installSpy(r, "navigation.validateNavigationOptions", (a) => {
        got = a[0];
        frozen = Object.isFrozen(a[0] as object);
      });
      await settleFn(() => api.navigateToState(api.makeState("b", {}, {}, "/b"), bag));
      rows.D4_isCallerBag = (got as unknown) === (bag as unknown);
      rows.D4_frozenAtHandout = frozen;
      r.stop();
    }
    out("M1 · идентичность контейнера у валидатора (подставной валидатор)", rows);
  }

  // M2 — счёт чтений контейнера С плагином и БЕЗ него (реальный плагин).
  {
    const rows: Record<string, unknown> = {};
    // D1
    {
      const { r } = await freshValidated();
      const c = countingBag({ replace: true, reload: false });
      await r.navigate("b", {}, {}, c.bag as NavigationOptions);
      rows.D1_withPlugin = { ...c.reads };
      r.stop();
      const { r: r2 } = await freshPlain();
      const c2 = countingBag({ replace: true, reload: false });
      await r2.navigate("b", {}, {}, c2.bag as NavigationOptions);
      rows.D1_noPlugin = { ...c2.reads };
      r2.stop();
    }
    // D2+D3 (обе двери в одном кадре)
    {
      const { r } = await freshValidated("/b");
      const c = countingBag({ replace: true, reload: true });
      rows.D2D3_res = await settleFn(() => 
        r.navigateToDefault(c.bag as NavigationOptions),
      );
      rows.D2D3_withPlugin = { ...c.reads };
      r.stop();
      const { r: r2 } = await freshPlain("/b");
      const c2 = countingBag({ replace: true, reload: true });
      await settleFn(() => r2.navigateToDefault(c2.bag as NavigationOptions));
      rows.D2D3_noPlugin = { ...c2.reads };
      r2.stop();
    }
    // D4
    {
      const { r } = await freshValidated();
      const api = getPluginApi(r);
      const c = countingBag({ replace: true, reload: false });
      rows.D4_res = await settleFn(() => 
        api.navigateToState(
          api.makeState("b", {}, {}, "/b"),
          c.bag as NavigationOptions,
        ),
      );
      rows.D4_withPlugin = { ...c.reads };
      r.stop();
      const { r: r2 } = await freshPlain();
      const api2 = getPluginApi(r2);
      const c2 = countingBag({ replace: true, reload: false });
      await settleFn(() => 
        api2.navigateToState(
          api2.makeState("b", {}, {}, "/b"),
          c2.bag as NavigationOptions,
        ),
      );
      rows.D4_noPlugin = { ...c2.reads };
      r2.stop();
    }
    out("M2 · чтений на ключ: реальный validation-plugin vs без него", rows);
  }

  // ======================================================= A · ЭКСПЕРИМЕНТ (а)
  // A1 — оригинал против ПРЕДВАРИТЕЛЬНО СКОПИРОВАННОГО контейнера (легальный вход).
  {
    const nested = { deep: 1 };
    const observe = async (useCopy: boolean) => {
      const { r, h } = await freshValidated();
      const orig: Record<string, unknown> = {
        replace: true,
        nested,
      };
      const handed = useCopy ? { ...orig } : orig;
      const st = await r.navigate(
        "b",
        {},
        {},
        handed as unknown as NavigationOptions,
      );
      const hookOpts = h.last();
      const res = {
        name: st.name,
        path: st.path,
        params: st.params,
        search: st.search,
        contextKeys: Object.keys(st.context ?? {}),
        meta: st.meta === undefined ? "undefined" : "present",
        hookCount: h.count(),
        hookKeys: Object.keys(hookOpts).sort(),
        hookReplace: hookOpts.replace,
        hookNestedIsSameLeaf: hookOpts.nested === nested,
        hookFrozen: Object.isFrozen(hookOpts),
        hookIsHandedBag: (hookOpts as unknown) === (handed as unknown),
        origFrozenAfter: Object.isFrozen(orig),
        nestedFrozenAfter: Object.isFrozen(nested),
        getStateName: r.getState().name,
      };
      r.stop();

      return res;
    };
    const withOrig = await observe(false);
    const withCopy = await observe(true);
    out("A1 · (а) оригинал vs мелкая копия контейнера, легальный вход", {
      A1_orig: withOrig,
      A1_copy: withCopy,
      A1_identical:
        JSON.stringify(withOrig) === JSON.stringify(withCopy) ? "ДА" : "НЕТ",
    });
  }

  // A2 — эмуляция (а) НА ГРАНИЦЕ: копия ДО валидатора (adopt-first обёртка),
  //      под ДРЕЙФУЮЩИМ мешком. Показывает, закрывает ли (а) пару проверил/применил.
  {
    const run = async (adoptFirst: boolean, arc: "D1" | "D3" | "D4") => {
      const { r, h } = await freshValidated(arc === "D3" ? "/b" : "/a");
      // на D1/D4 навигация в то же состояние: сначала встанем в "b"
      if (arc !== "D3") await r.navigate("b");
      const d = driftingBag({ reload: false }, { reload: true });
      const handed = (
        adoptFirst ? adoptNavigationOptions(d.bag as NavigationOptions) : d.bag
      ) as NavigationOptions;
      let res: string;
      if (arc === "D1") {
        res = await settleFn(() => r.navigate("b", {}, {}, handed));
      } else if (arc === "D3") {
        res = await settleFn(() => r.navigateToDefault(handed));
      } else {
        const api = getPluginApi(r);
        res = await settleFn(() => 
          api.navigateToState(api.makeState("b", {}, {}, "/b"), handed),
        );
      }
      const hookOpts = h.last();
      const o = {
        res,
        reads: { ...d.reads },
        hookReload: hookOpts?.reload,
      };
      r.stop();

      return o;
    };
    for (const arc of ["D1", "D3", "D4"] as const) {
      out(`A2 · ${arc} · дрейф reload: baseline vs adopt-first (эмуляция (а))`, {
        baseline: await run(false, arc),
        adoptFirst: await run(true, arc),
      });
    }
  }

  // A3 — ограничение (а): валидатор судит и НЕ-объект (D2 — сырой аргумент).
  {
    const { r } = await freshValidated("/b");
    const raw = await settleFn(() => 
      r.navigateToDefault("nope" as unknown as NavigationOptions),
    );
    let adoptedShape: unknown;
    let adoptThrew: string | undefined;
    try {
      adoptedShape = adoptNavigationOptions(
        "nope" as unknown as NavigationOptions,
      );
    } catch (e) {
      adoptThrew = String(e);
    }
    out("A3 · (а) и не-объект: что теряет копия ДО валидатора", {
      A3_baseline_navigateToDefault_string: raw,
      A3_adoptOfString: adoptedShape,
      A3_adoptThrew: adoptThrew,
    });
    r.stop();
  }

  // ======================================================= P1
  {
    const rows: Record<string, unknown> = {};
    // D1 — дрейф reload меняет ВЕРДИКТ ядра при валидном первом чтении.
    {
      const { r, h } = await freshValidated();
      await r.navigate("b");
      const d = driftingBag({ reload: false }, { reload: true });
      rows.D1_res = await settleFn(() => 
        r.navigate("b", {}, {}, d.bag as NavigationOptions),
      );
      rows.D1_reads = { ...d.reads };
      rows.D1_hookReload = h.last()?.reload;
      r.stop();
      // контроль: тот же вход БЕЗ дрейфа
      const { r: rc } = await freshValidated();
      await rc.navigate("b");
      rows.D1_control_stableBag = await settleFn(() => 
        rc.navigate("b", {}, {}, { reload: false }),
      );
      rc.stop();
    }
    // D1b — дрейф ТИПА: валидатор видит boolean, ядро применяет строку.
    {
      const { r, h } = await freshValidated();
      const d = driftingBag(
        { replace: true },
        { replace: "NOT-A-BOOLEAN" as unknown as boolean },
      );
      rows.D1b_res = await settleFn(() => 
        r.navigate("b", {}, {}, d.bag as NavigationOptions),
      );
      rows.D1b_landedReplace = h.last()?.replace;
      rows.D1b_reads = { ...d.reads };
      // контроль: та же строка, поданная СРАЗУ — валидатор её отвергает
      const { r: rc } = await freshValidated();
      rows.D1b_control_directString = await settleFn(() => 
        rc.navigate("b", {}, {}, {
          replace: "NOT-A-BOOLEAN",
        } as unknown as NavigationOptions),
      );
      r.stop();
      rc.stop();
    }
    // D2/D3 — тот же кадр, два прохода валидатора + проход ядра.
    {
      const { r, h } = await freshValidated("/b");
      const d = driftingBag({ reload: false }, { reload: true });
      rows.D2D3_res = await settleFn(() => 
        r.navigateToDefault(d.bag as NavigationOptions),
      );
      rows.D2D3_reads = { ...d.reads };
      rows.D2D3_hookReload = h.last()?.reload;
      r.stop();
      const { r: rc } = await freshValidated("/b");
      rows.D2D3_control_stableBag = await settleFn(() => 
        rc.navigateToDefault({ reload: false }),
      );
      rc.stop();
    }
    // D4
    {
      const { r, h } = await freshValidated();
      await r.navigate("b");
      const api = getPluginApi(r);
      const d = driftingBag({ reload: false }, { reload: true });
      rows.D4_res = await settleFn(() => 
        api.navigateToState(
          api.makeState("b", {}, {}, "/b"),
          d.bag as NavigationOptions,
        ),
      );
      rows.D4_reads = { ...d.reads };
      rows.D4_hookReload = h.last()?.reload;
      r.stop();
      const { r: rc } = await freshValidated();
      await rc.navigate("b");
      const api2 = getPluginApi(rc);
      rows.D4_control_stableBag = await settleFn(() => 
        api2.navigateToState(api2.makeState("b", {}, {}, "/b"), {
          reload: false,
        }),
      );
      rc.stop();
    }
    out("P1 · дрейфующий вход: валидатор проверил ≠ ядро применило", rows);
  }

  // ======================================================= P2
  {
    const rows: Record<string, unknown> = {};
    for (const arc of ["D1", "D3", "D4"] as const) {
      // скрытый ЛЕГАЛЬНЫЙ ключ: попадает ли он в состояние ядра
      const { r, h } = await freshValidated(arc === "D3" ? "/b" : "/a");
      const lie = lyingProxy({ marker: "v" }, { reload: true });
      let res: string;
      if (arc === "D1") res = await settleFn(() => r.navigate("b", {}, {}, lie));
      else if (arc === "D3") res = await settleFn(() => r.navigateToDefault(lie));
      else {
        const api = getPluginApi(r);
        res = await settleFn(() => 
          api.navigateToState(api.makeState("b", {}, {}, "/b"), lie),
        );
      }
      const hookOpts = h.last();
      rows[`${arc}_res`] = res;
      rows[`${arc}_hookKeys`] = hookOpts ? Object.keys(hookOpts) : null;
      rows[`${arc}_sneakyLanded`] = hookOpts?.reload;
      rows[`${arc}_visibleLanded`] = hookOpts?.marker;
      r.stop();
    }
    // скрытый НЕЛЕГАЛЬНЫЙ ключ: валидатор судит по тому, чего ядро не возьмёт
    {
      const { r } = await freshValidated();
      const lie = lyingProxy({ marker: "v" }, { replace: "NOT-A-BOOLEAN" });
      rows.D1_hiddenIllegal_res = await settleFn(() => r.navigate("b", {}, {}, lie));
      r.stop();
      const { r: rp, h: hp } = await freshPlain();
      const lie2 = lyingProxy({ marker: "v" }, { replace: "NOT-A-BOOLEAN" });
      rows.D1_hiddenIllegal_noPlugin = await settleFn(() => 
        rp.navigate("b", {}, {}, lie2),
      );
      rows.D1_hiddenIllegal_noPlugin_hookKeys = Object.keys(hp.last());
      rp.stop();
    }
    out("P2 · лгущий Proxy (ownKeys молчит, gOPD утверждает «собственный»)", rows);
  }

  // ======================================================= P3
  {
    const rows: Record<string, unknown> = {};
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
    try {
      const { r, h } = await freshValidated();
      const res = await settleFn(() => 
        r.navigate("b", {}, {}, {
          marker: "via-define",
          replace: true,
        } as unknown as NavigationOptions),
      );
      rows.P3_res = res;
      rows.P3_inheritedSetterHits = setterHits;
      rows.P3_markerOwnOnCoreCopy = Object.hasOwn(h.last(), "marker");
      rows.P3_markerValueOnCoreCopy = h.last().marker;
      r.stop();
    } catch (e) {
      threw = String(e);
    } finally {
      delete (Object.prototype as Record<string, unknown>).marker;
    }
    rows.P3_threw = threw;

    // собственный "__proto__" из JSON.parse
    {
      const { r, h } = await freshValidated();
      const poisoned = JSON.parse(
        '{"__proto__":{"pwned":1},"replace":true,"marker":"pp"}',
      ) as NavigationOptions;
      rows.P3_poison_res = await settleFn(() => r.navigate("b", {}, {}, poisoned));
      const hookOpts = h.last();
      rows.P3_poison_ownProtoOnCoreCopy = Object.hasOwn(
        hookOpts ?? {},
        "__proto__",
      );
      rows.P3_poison_coreCopyProtoOk =
        Object.getPrototypeOf(hookOpts ?? {}) === Object.prototype;
      rows.P3_poison_globalPwned =
        ({} as Record<string, unknown>).pwned !== undefined;
      rows.P3_poison_markerLanded = hookOpts?.marker;
      r.stop();
    }
    out("P3 · унаследованный аксессор + собственный __proto__ (арка D1)", rows);
  }

  // ======================================================= P4
  {
    const rows: Record<string, unknown> = {};
    for (const arc of ["D1", "D3", "D4"] as const) {
      const { r, h } = await freshValidated(arc === "D3" ? "/b" : "/a");
      const nested = { deep: 1 };
      const bag = { replace: true, nested } as unknown as NavigationOptions;
      let res: string;
      if (arc === "D1") res = await settleFn(() => r.navigate("b", {}, {}, bag));
      else if (arc === "D3") res = await settleFn(() => r.navigateToDefault(bag));
      else {
        const api = getPluginApi(r);
        res = await settleFn(() => 
          api.navigateToState(api.makeState("b", {}, {}, "/b"), bag),
        );
      }
      const hookOpts = h.last();
      rows[`${arc}_res`] = res;
      rows[`${arc}_coreLevelFrozen`] = Object.isFrozen(hookOpts);
      rows[`${arc}_callerBagFrozen`] = Object.isFrozen(bag);
      rows[`${arc}_callerNestedFrozen`] = Object.isFrozen(nested);
      rows[`${arc}_nestedSameLeafInCoreCopy`] = hookOpts?.nested === nested;
      r.stop();
    }
    out("P4 · заморожен уровень ядра и не глубже", rows);
  }
}

void main();
