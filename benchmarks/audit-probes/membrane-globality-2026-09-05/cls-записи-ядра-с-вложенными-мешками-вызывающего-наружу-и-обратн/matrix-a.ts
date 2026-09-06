/**
 * МАТРИЦА семейства «записи-ядра-с-вложенными-мешками-вызывающего · наружу-и-обратно».
 * Часть A — ЭКСПЕРИМЕНТ (а): дверь с оригиналом против двери с копией на границе.
 * Строки: D1 PluginApi.getRouteConfig·return
 *         D2 PluginApi.getOptions·return (вложенные мешки вызывающего)
 *         D3 RoutesNamespace.matchPath·encodeParams·channels.params
 * Все наблюдения снаружи src.
 */
import { createRouter } from "@real-router/core";
import {
  cloneRouter,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

const say = (k: string, v: unknown): void =>
  console.log(`${k}: ${JSON.stringify(v)}`);
const line = (t: string): void => console.log(`\n===== ${t} =====`);

class Svc {
  tag = "leaf-service";
}

async function main(): Promise<void> {
  // ------------------------------------------------------------------ ПК среды
  line("ПОЗИТИВНЫЙ КОНТРОЛЬ СРЕДЫ");
  {
    const r = createRouter(
      [{ name: "u", path: "/u/:id?tab" }] as never,
      {} as never,
    );
    await r.start("/u/7?tab=a");
    say("PC · start дал state", {
      name: r.getState()?.name,
      params: r.getState()?.params,
      search: r.getState()?.search,
      path: r.getState()?.path,
    });
    say("PC · buildPath", r.buildPath("u", { id: "3" } as never));
    r.dispose();
  }

  // ============================================================ D1 getRouteConfig
  line("(a) D1 getRouteConfig·return — живая запись против копии на выдаче");
  {
    const svc = new Svc();
    const nestedLeaf = { deep: 1 };

    const build = () =>
      createRouter(
        [
          {
            name: "a",
            path: "/a/:id",
            preload: svc,
            searchSchema: "s0",
            nested: nestedLeaf,
          },
        ] as never,
        {} as never,
      );

    // АРМ 1 — как сегодня: ядро отдаёт ЖИВУЮ запись.
    const rOrig = build();
    const apiOrig = getPluginApi(rOrig as never);
    const readOrig = (n: string): Record<string, unknown> | undefined =>
      apiOrig.getRouteConfig(n) as Record<string, unknown> | undefined;

    // АРМ 2 — эмуляция (а): контейнер копируется на границе выдачи, листья те же.
    const rCopy = build();
    const apiCopy = getPluginApi(rCopy as never);
    const readCopy = (n: string): Record<string, unknown> | undefined => {
      const rec = apiCopy.getRouteConfig(n) as
        | Record<string, unknown>
        | undefined;

      return rec === undefined ? undefined : { ...rec };
    };

    const c1 = readOrig("a")!;
    const c2 = readCopy("a")!;

    say("D1 · ПК запись существует [ориг,копия]", [
      c1 !== undefined,
      c2 !== undefined,
    ]);
    say("D1 · значения, которые читают отгруженные плагины [ориг,копия]", [
      { preloadIsSvc: c1.preload === svc, schema: c1.searchSchema },
      { preloadIsSvc: c2.preload === svc, schema: c2.searchSchema },
    ]);
    say("D1 · ЛИСТЬЯ по ссылке [ориг,копия]", [
      c1.nested === nestedLeaf,
      c2.nested === nestedLeaf,
    ]);
    say(
      "D1 · записи по значению совпадают",
      JSON.stringify(c1) === JSON.stringify(c2),
    );
    say("D1 · та же ссылка дважды [ориг,копия]", [
      readOrig("a") === c1,
      readCopy("a") === c2,
    ]);
    say("D1 · frozen [ориг,копия]", [Object.isFrozen(c1), Object.isFrozen(c2)]);
    say("D1 · неизвестный маршрут [ориг,копия]", [
      readOrig("nope"),
      readCopy("nope"),
    ]);

    // ОБРАТНАЯ ВИДИМОСТЬ: приложение пишет в отданный объект.
    c1.injected = "by-app";
    c2.injected = "by-app";
    getRoutesApi(rOrig as never).update("a", { searchSchema: "s1" } as never);
    getRoutesApi(rCopy as never).update("a", { searchSchema: "s1" } as never);

    const a1 = readOrig("a")!;
    const a2 = readCopy("a")!;

    say("D1 · ПК легальный update долетел [ориг,копия]", [
      a1.searchSchema === "s1" && a1.preload === svc,
      a2.searchSchema === "s1" && a2.preload === svc,
    ]);
    say(
      "D1 · РАСХОЖДЕНИЕ: запись приложения перенесена ядром вперёд [ориг,копия]",
      [a1.injected === "by-app", a2.injected === "by-app"],
    );

    // Наблюдатель: клон делит записи Object.assign'ом.
    const clOrig = cloneRouter(rOrig as never);
    const clCopy = cloneRouter(rCopy as never);
    const g1 = getPluginApi(clOrig as never).getRouteConfig("a") as Record<
      string,
      unknown
    >;
    const g2 = getPluginApi(clCopy as never).getRouteConfig("a") as Record<
      string,
      unknown
    >;

    say("D1 · клон: значения совпадают у обеих арм", [
      { schema: g1.searchSchema, preloadIsSvc: g1.preload === svc },
      { schema: g2.searchSchema, preloadIsSvc: g2.preload === svc },
    ]);
    say("D1 · клон делит ЗАПИСЬ ЯДРА (не хэндаут) [ориг,копия]", [
      g1 === readOrig("a"),
      g2 === (getPluginApi(rCopy as never).getRouteConfig("a") as unknown),
    ]);

    // Комплементарный вид: get() кастом-полей не несёт — в обеих армах одинаково.
    const gv1 = getRoutesApi(rOrig as never).get("a") as unknown as Record<
      string,
      unknown
    >;

    say("D1 · RoutesApi.get не несёт кастом-полей", {
      searchSchema: gv1.searchSchema,
      preload: gv1.preload,
      path: gv1.path,
    });

    clOrig.dispose();
    clCopy.dispose();
    rOrig.dispose();
    rCopy.dispose();
  }

  // ================================================================ D2 getOptions
  line(
    "(a) D2 getOptions·return — вложенный мешок вызывающего против его предкопии",
  );
  {
    const svc = new Svc();

    const run = async (
      pre: boolean,
    ): Promise<Record<string, unknown>> => {
      const appBag: Record<string, unknown> = { id: "orig", svc };
      const handed = pre ? { ...appBag } : appBag;
      const router = createRouter([{ name: "d", path: "/d/:id" }] as never, {
        defaultRoute: "d",
        defaultParams: handed,
      } as never);
      const opts = getPluginApi(router as never).getOptions() as unknown as Record<
        string,
        unknown
      >;

      await router.start("/d/1");
      const before = (
        (await router.navigateToDefault()) as unknown as {
          params: Record<string, unknown>;
        }
      ).params.id;

      // приложение мутирует СВОЙ мешок ПОСЛЕ конструирования
      appBag.id = "mutated";
      await router.navigate("d", { id: "9" } as never);
      const after = (
        (await router.navigateToDefault()) as unknown as {
          params: Record<string, unknown>;
        }
      ).params.id;

      const cs = (
        getInternals(router as never) as unknown as {
          getCloneState: () => { options: Record<string, unknown> };
        }
      ).getCloneState();
      const clone = cloneRouter(router as never);

      await clone.start("/d/1");
      const cloneDefault = (
        (await clone.navigateToDefault()) as unknown as {
          params: Record<string, unknown>;
        }
      ).params.id;

      const res = {
        shellFrozen: Object.isFrozen(opts),
        nestedIsCallerObject: opts.defaultParams === appBag,
        nestedFrozen: Object.isFrozen(opts.defaultParams),
        leafKept: (opts.defaultParams as Record<string, unknown>).svc === svc,
        before,
        after,
        cloneDefault,
        cloneStateNested:
          (cs.options as Record<string, unknown>).defaultParams === appBag,
      };

      clone.dispose();
      router.dispose();

      return res;
    };

    const orig = await run(false);
    const copy = await run(true);

    for (const k of Object.keys(orig)) {
      say(`D2 · ${k} [ориг,копия]`, [orig[k], copy[k]]);
    }
  }

  // ============================================ D3 matchPath · encodeParams
  line(
    "(a) D3 matchPath·encodeParams·channels.params — ручка против спреда",
  );
  {
    type Ch = {
      params: Record<string, unknown>;
      search: Record<string, unknown>;
    };

    const mk = (
      codec: (ch: Ch) => Ch,
    ): { st: unknown; seen: { v?: object } } => {
      const seen: { v?: object } = {};
      const router = createRouter(
        [
          {
            name: "e",
            path: "/e/:id?tab",
            encodeParams: ((ch: Ch) => {
              seen.v = ch.params;

              return codec(ch);
            }) as never,
          },
        ] as never,
        {} as never,
      );
      const ctx = getInternals(router as never) as unknown as {
        matchPath: (
          p: string,
          o: unknown,
        ) =>
          | {
              params: Record<string, unknown>;
              search: Record<string, unknown>;
              path: string;
            }
          | undefined;
        getOptions: () => Record<string, unknown>;
      };
      const st = ctx.matchPath("/e/9", {
        ...ctx.getOptions(),
        rewritePathOnMatch: true,
      });

      router.dispose();

      return { st, seen };
    };

    // ПК — легальный кодек (возвращает НОВЫЙ мешок, документированный контракт)
    const legal = mk((ch) => ({
      params: { ...ch.params, id: String(ch.params.id) },
      search: { ...ch.search },
    }));
    const legalSt = legal.st as {
      params: Record<string, unknown>;
      path: string;
    };

    say("D3 · ПК легальный кодек: params/path", {
      params: legalSt.params,
      path: legalSt.path,
    });

    // АРМ 1 (как сегодня): кодек пишет В ОТДАННЫЙ объект in place и возвращает ch
    const origArm = mk((ch) => {
      ch.params.injected = "IN-PLACE";
      ch.params.tab = "LATE";

      return ch;
    });
    const oSt = origArm.st as {
      params: Record<string, unknown>;
      search: Record<string, unknown>;
      path: string;
    };

    say(
      "D3 · ПК реальный параметр раскодирован (ветвь достигнута)",
      oSt.params.id === "9",
    );
    say("D3 · ориг: объект кодека === state.params", origArm.seen.v === oSt.params);
    say("D3 · ориг: state.params / state.search / state.path", {
      params: oSt.params,
      search: oSt.search,
      path: oSt.path,
    });
    say(
      "D3 · ориг: state.params frozen ПОСЛЕ (materialize)",
      Object.isFrozen(oSt.params),
    );
    say(
      "D3 · ориг: прототип state.params",
      Object.getPrototypeOf(oSt.params) === null
        ? "null"
        : "Object.prototype?" + String(Object.getPrototypeOf(oSt.params) === Object.prototype),
    );

    // АРМ 2 — эмуляция (а): граница спредит оба канала перед кодеком (дуга buildPath)
    const copyArm = mk((ch) => {
      const shielded: Ch = {
        params: { ...ch.params },
        search: { ...ch.search },
      };

      shielded.params.injected = "IN-PLACE";
      shielded.params.tab = "LATE";

      return shielded;
    });
    const cSt = copyArm.st as {
      params: Record<string, unknown>;
      search: Record<string, unknown>;
      path: string;
    };

    say("D3 · копия: state.params / state.search / state.path", {
      params: cSt.params,
      search: cSt.search,
      path: cSt.path,
    });
    say(
      "D3 · РАСХОЖДЕНИЕ: запись кодека in place попала в состояние [ориг,копия]",
      [oSt.params.injected === "IN-PLACE", cSt.params.injected === "IN-PLACE"],
    );
    say("D3 · state.params несёт tab, которого нет в state.path [ориг,копия]", [
      oSt.params.tab === "LATE" && !oSt.path.includes("tab"),
      cSt.params.tab === "LATE" && !cSt.path.includes("tab"),
    ]);

    // КОНТРОЛЬ асимметрии: та же in-place-запись на дуге buildPath (там спред стоит)
    {
      const router = createRouter(
        [
          {
            name: "b",
            path: "/b/:id?tab",
            encodeParams: ((ch: Ch) => {
              ch.params.injected = "IN-PLACE";

              return ch;
            }) as never,
          },
        ] as never,
        {} as never,
      );
      const callerBag: Record<string, unknown> = { id: "5" };
      const href = router.buildPath("b", callerBag as never);

      say("D3 · КОНТРОЛЬ дуги buildPath: href / мешок вызывающего после", {
        href,
        callerBagAfter: callerBag,
      });
      router.dispose();
    }
  }
}

void main();
