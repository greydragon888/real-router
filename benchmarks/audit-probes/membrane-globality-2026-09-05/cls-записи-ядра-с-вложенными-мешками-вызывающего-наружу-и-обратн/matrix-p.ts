/**
 * МАТРИЦА того же семейства, часть P — свойства P1..P4 СЕГОДНЯ.
 * Строки: D1 getRouteConfig·return · D2 getOptions·return · D3 matchPath·encodeParams·channels.params.
 * Каждый столбец — с позитивным контролем и ДРЕЙФУЮЩИМ/ЛГУЩИМ входом.
 */
import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import {
  countingProxy,
  driftingBag,
} from "../../../../packages/core/tests/helpers/hostileBags";

const say = (k: string, v: unknown): void =>
  console.log(`${k}: ${JSON.stringify(v)}`);
const line = (t: string): void => console.log(`\n===== ${t} =====`);

/** Проксирует мешок и ЛЖЁТ: ownKeys не называет ключ, gOPD утверждает, что он собственный. */
function lyingProxy(
  source: Record<string, unknown>,
  hidden: string,
): Record<string, unknown> {
  return new Proxy(source, {
    ownKeys: (t) => Reflect.ownKeys(t).filter((k) => k !== hidden),
    getOwnPropertyDescriptor: (t, k) =>
      k === hidden
        ? {
            value: (t as Record<string, unknown>)[hidden],
            enumerable: true,
            configurable: true,
            writable: true,
          }
        : Reflect.getOwnPropertyDescriptor(t, k),
  });
}

async function main(): Promise<void> {
  // =============================================================== D1 · P1..P4
  line("D1 getRouteConfig·return");
  {
    // --- P1: дрейфующие аксессоры НА ЖИВОЙ ОТДАННОЙ ЗАПИСИ, счёт чтений ядром
    const r = createRouter(
      [{ name: "a", path: "/a", cfA: "A0", cfB: "B0" }] as never,
      {} as never,
    );
    const api = getPluginApi(r as never);
    const rec = api.getRouteConfig("a") as Record<string, unknown>;
    const reads: Record<string, number> = {};

    for (const key of ["cfA", "cfB"]) {
      const first = rec[key];

      Object.defineProperty(rec, key, {
        enumerable: true,
        configurable: true,
        get(): unknown {
          reads[key] = (reads[key] ?? 0) + 1;

          return reads[key] === 1 ? first : "DRIFTED";
        },
      });
    }

    getRoutesApi(r as never).update("a", { cfNew: "N" } as never);
    const after = api.getRouteConfig("a") as Record<string, unknown>;

    say("D1·P1 · чтений ядром на ключ отданной записи", reads);
    say("D1·P1 · ПК легальное поле патча приземлилось", after.cfNew === "N");
    say("D1·P1 · перенесено значение ПЕРВОГО чтения", {
      cfA: after.cfA,
      cfB: after.cfB,
    });
    say(
      "D1·P1 · аксессор приложения приземлился ДАННЫМИ (не аксессором)",
      Object.getOwnPropertyDescriptor(after, "cfA")?.get === undefined,
    );

    // --- P2: перечисление на чтении обратно
    const r2 = createRouter(
      [{ name: "a", path: "/a", cfA: "A0" }] as never,
      {} as never,
    );
    const api2 = getPluginApi(r2 as never);
    const rec2 = api2.getRouteConfig("a") as Record<string, unknown>;

    Object.defineProperty(rec2, "hiddenOwn", {
      value: "H",
      enumerable: false,
      configurable: true,
      writable: true,
    });
    rec2.visibleOwn = "V";
    getRoutesApi(r2 as never).update("a", { cfB: "B" } as never);
    const after2 = api2.getRouteConfig("a") as Record<string, unknown>;

    say("D1·P2 · ПК собственный ПЕРЕЧИСЛИМЫЙ ключ перенесён", after2.visibleOwn);
    say(
      "D1·P2 · собственный НЕперечислимый ключ НЕ перенесён (ownKeys+enumerable)",
      Object.hasOwn(after2, "hiddenOwn"),
    );
    say("D1·P2 · ПК легальный патч на месте", after2.cfB === "B");
    say(
      "D1·P2 · лгущий Proxy на этой двери неустановим — контейнер строит ядро",
      "неприменимо",
    );

    // --- P3: унаследованный аксессор + собственный __proto__
    const r3 = createRouter(
      [{ name: "a", path: "/a", zzKeep: "K" }] as never,
      {} as never,
    );
    const api3 = getPluginApi(r3 as never);
    let setterHits = 0;
    let getterHits = 0;
    let threw = "";
    let out3: Record<string, unknown> | undefined;

    Object.defineProperty(Object.prototype, "zzHaz", {
      configurable: true,
      get(): unknown {
        getterHits += 1;

        return "FROM-PROTO";
      },
      set(): void {
        setterHits += 1;
      },
    });
    try {
      getRoutesApi(r3 as never).update("a", { zzHaz: 42 } as never);
      out3 = api3.getRouteConfig("a") as Record<string, unknown>;
    } catch (e) {
      threw = (e as Error).message;
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete (Object.prototype as Record<string, unknown>).zzHaz;
    }

    say("D1·P3 · бросило?", threw);
    say("D1·P3 · сеттер прототипа сработал (раз)", setterHits);
    say("D1·P3 · значение приземлилось СОБСТВЕННЫМ ключом", {
      own: out3 !== undefined && Object.hasOwn(out3, "zzHaz"),
      value: out3?.zzHaz,
    });
    say("D1·P3 · ПК соседнее поле уцелело", out3?.zzKeep === "K");
    say("D1·P3 · геттер прототипа за проход", getterHits);

    const r4 = createRouter(
      [{ name: "a", path: "/a", cfA: "A" }] as never,
      {} as never,
    );
    const api4 = getPluginApi(r4 as never);
    const patch = JSON.parse('{"__proto__":{"polluted":1},"cfB":"B"}') as never;

    getRoutesApi(r4 as never).update("a", patch);
    const out4 = api4.getRouteConfig("a") as Record<string, unknown>;

    say("D1·P3 · собственный \"__proto__\" остался ключом записи", {
      own: Object.hasOwn(out4, "__proto__"),
      protoIsObjectPrototype: Object.getPrototypeOf(out4) === Object.prototype,
      polluted: (out4 as { polluted?: unknown }).polluted,
    });
    say("D1·P3 · ПК соседнее поле патча приземлилось", out4.cfB === "B");

    // --- P4: заморожен ли уровень, ПОРОЖДЁННЫЙ ЯДРОМ
    const r5 = createRouter(
      [{ name: "a", path: "/a", cfA: "A", nested: { x: 1 } }] as never,
      {} as never,
    );
    const api5 = getPluginApi(r5 as never);
    const rec5 = api5.getRouteConfig("a") as Record<string, unknown>;

    say("D1·P4 · уровень ЯДРА (сама запись) frozen", Object.isFrozen(rec5));
    say(
      "D1·P4 · вложенный мешок ВЫЗЫВАЮЩЕГО frozen",
      Object.isFrozen(rec5.nested),
    );
    getRoutesApi(r5 as never).update("a", { cfB: "B" } as never);
    say("D1·P4 · старая запись ядром НЕ мутируется на месте (замена)", {
      oldStillOld: rec5.cfB === undefined,
      newHasIt:
        (api5.getRouteConfig("a") as Record<string, unknown>).cfB === "B",
      replaced: api5.getRouteConfig("a") !== rec5,
    });

    r.dispose();
    r2.dispose();
    r3.dispose();
    r4.dispose();
    r5.dispose();
  }

  // =============================================================== D2 · P1..P4
  line("D2 getOptions·return (вложенные мешки вызывающего)");
  {
    // --- P1: countingProxy как defaultParams
    const cp = countingProxy({ id: "orig", extra: "E" });
    const rp = createRouter([{ name: "d", path: "/d/:id" }] as never, {
      defaultRoute: "d",
      defaultParams: cp.bag,
    } as never);

    await rp.start("/d/1");
    const st = (await rp.navigateToDefault()) as unknown as {
      params: Record<string, unknown>;
      path: string;
    };

    say("D2·P1 · ПК navigateToDefault дал state", {
      params: st.params,
      path: st.path,
    });
    say("D2·P1 · чтений на ключ за ОДИН navigateToDefault", { ...cp.reads });

    // --- P1 дрейф
    const db = driftingBag({ id: "FIRST" }, { id: "SECOND" });
    const rd = createRouter([{ name: "d", path: "/d/:id" }] as never, {
      defaultRoute: "d",
      defaultParams: db.bag,
    } as never);

    await rd.start("/d/1");
    const sd = (await rd.navigateToDefault()) as unknown as {
      params: Record<string, unknown>;
      path: string;
    };

    say("D2·P1 · дрейф: чтений", { ...db.reads });
    say("D2·P1 · дрейф: params/path (должно быть значение ПЕРВОГО чтения)", {
      params: sd.params,
      path: sd.path,
    });

    // --- P2: лгущий Proxy как defaultParams
    const honest = { id: "HON" };
    const rh = createRouter([{ name: "d", path: "/d/:id" }] as never, {
      defaultRoute: "d",
      defaultParams: honest,
    } as never);

    await rh.start("/d/1");
    say("D2·P2 · ПК честный мешок: ключ доходит", {
      params: (
        (await rh.navigateToDefault()) as unknown as {
          params: Record<string, unknown>;
        }
      ).params,
    });

    const rl = createRouter([{ name: "d", path: "/d/:id" }] as never, {
      defaultRoute: "d",
      defaultParams: lyingProxy({ id: "LIED", keep: "K" }, "id"),
    } as never);

    await rl.start("/d/1");
    let lieOut: unknown;
    let lieThrew = "";

    try {
      lieOut = (
        (await rl.navigateToDefault()) as unknown as {
          params: Record<string, unknown>;
          path: string;
        }
      );
    } catch (e) {
      lieThrew = (e as Error).message;
    }
    say("D2·P2 · лгущий Proxy: бросило?", lieThrew);
    say("D2·P2 · лгущий ключ попал в состояние?", lieOut);

    // --- P3: унаследованный аксессор под именем ключа + собственный __proto__
    let s3 = 0;
    let p3out: unknown;
    let p3threw = "";

    const rp3 = createRouter([{ name: "d", path: "/d/:id" }] as never, {
      defaultRoute: "d",
      defaultParams: { id: "PROTO-TEST" },
    } as never);

    await rp3.start("/d/1");
    Object.defineProperty(Object.prototype, "id", {
      configurable: true,
      get: (): unknown => "FROM-PROTO",
      set: (): void => {
        s3 += 1;
      },
    });
    try {
      p3out = (
        (await rp3.navigateToDefault()) as unknown as {
          params: Record<string, unknown>;
          path: string;
        }
      );
    } catch (e) {
      p3threw = (e as Error).message;
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete (Object.prototype as Record<string, unknown>).id;
    }
    say("D2·P3 · бросило?", p3threw);
    say("D2·P3 · сеттер прототипа сработал (раз)", s3);
    say("D2·P3 · результат", p3out);

    const rp4 = createRouter([{ name: "d", path: "/d/:id" }] as never, {
      defaultRoute: "d",
      defaultParams: JSON.parse('{"id":"OK","__proto__":{"polluted":1}}'),
    } as never);

    await rp4.start("/d/1");
    const s4 = (await rp4.navigateToDefault()) as unknown as {
      params: Record<string, unknown>;
      path: string;
    };

    say("D2·P3 · собственный __proto__ в defaultParams", {
      params: s4.params,
      path: s4.path,
      protoOfParams:
        Object.getPrototypeOf(s4.params) === null
          ? "null"
          : Object.getPrototypeOf(s4.params) === Object.prototype
            ? "Object.prototype"
            : "OTHER",
      polluted: ({} as { polluted?: unknown }).polluted,
    });

    // --- P4
    const callerBag: Record<string, unknown> = { id: "1", deep: { z: 1 } };
    const rq = createRouter([{ name: "d", path: "/d/:id" }] as never, {
      defaultRoute: "d",
      defaultParams: callerBag,
      queryParams: { arrayFormat: "brackets" },
      limits: { maxListeners: 50 },
    } as never);
    const opts = getPluginApi(rq as never).getOptions() as unknown as Record<
      string,
      unknown
    >;

    say("D2·P4 · уровень ЯДРА (оболочка options) frozen", Object.isFrozen(opts));
    say("D2·P4 · вложенные мешки ВЫЗЫВАЮЩЕГО frozen", {
      defaultParams: Object.isFrozen(opts.defaultParams),
      queryParams: Object.isFrozen(opts.queryParams),
      limits: Object.isFrozen(opts.limits),
      deep: Object.isFrozen(
        (opts.defaultParams as Record<string, unknown>).deep,
      ),
    });
    await rq.start("/d/zzz");
    const sq = (await rq.navigateToDefault()) as unknown as {
      params: Record<string, unknown>;
    };

    say("D2·P4 · опубликованный state.params frozen (уровень ядра)", {
      frozen: Object.isFrozen(sq.params),
      isCallerBag: sq.params === callerBag,
      callerBagFrozenAfter: Object.isFrozen(callerBag),
    });

    rp.dispose();
    rd.dispose();
    rh.dispose();
    rl.dispose();
    rp3.dispose();
    rp4.dispose();
    rq.dispose();
  }

  // =============================================================== D3 · P1..P4
  line("D3 matchPath·encodeParams·channels.params");
  {
    type Ch = {
      params: Record<string, unknown>;
      search: Record<string, unknown>;
    };

    const run = (
      codec: (ch: Ch) => Ch,
      routeExtra: Record<string, unknown> = {},
    ): { st: unknown } => {
      const router = createRouter(
        [
          {
            name: "e",
            path: "/e/:id",
            encodeParams: codec as never,
            ...routeExtra,
          },
        ] as never,
        {} as never,
      );
      const ctx = getInternals(router as never) as unknown as {
        matchPath: (p: string, o: unknown) => unknown;
        getOptions: () => Record<string, unknown>;
      };
      const st = ctx.matchPath("/e/9", {
        ...ctx.getOptions(),
        rewritePathOnMatch: true,
      });

      router.dispose();

      return { st };
    };

    // --- P1: дрейфующий аксессор, поставленный НА ОТДАННЫЙ объект ВНУТРИ кодека
    let reads = 0;
    const p1 = run((ch) => {
      Object.defineProperty(ch.params, "id", {
        enumerable: true,
        configurable: true,
        get(): unknown {
          reads += 1;

          return reads === 1 ? "9" : "DRIFTED";
        },
      });

      return ch;
    });
    const readsAfterCore = reads;
    const p1st = p1.st as { path: string; params: Record<string, unknown> };

    say("D3·P1 · чтений ключа ЯДРОМ после выдачи кодеку", readsAfterCore);
    say("D3·P1 · собранный state.path", p1st.path);
    say(
      "D3·P1 · ПК ветвь достигнута (кодек вызван, путь переписан)",
      p1st.path === "/e/9",
    );

    // --- P2: ядро не перечисляет отданный контейнер после кодека
    const p2 = run((ch) => {
      ch.params.undeclaredExtra = "X";
      Object.defineProperty(ch.params, "hiddenOwn", {
        value: "H",
        enumerable: false,
        configurable: true,
      });

      return ch;
    });
    const p2st = p2.st as { path: string; params: Record<string, unknown> };

    say("D3·P2 · путь собран по ОБЪЯВЛЕННЫМ слотам, не перечислением", {
      path: p2st.path,
      paramsKeys: Object.keys(p2st.params),
      hiddenOwnInParams: Object.hasOwn(p2st.params, "hiddenOwn"),
    });

    // --- P3: пишет ли ядро в отданный контейнер после выдачи; подмена прототипа
    const p3 = run((ch) => {
      Object.setPrototypeOf(ch.params, { inheritedSlot: "FROM-APP-PROTO" });

      return ch;
    });
    const p3st = p3.st as { path: string; params: Record<string, unknown> };

    say("D3·P3 · приложение подменило прототип отданного контейнера", {
      path: p3st.path,
      protoIsObjectPrototype:
        Object.getPrototypeOf(p3st.params) === Object.prototype,
      inheritedReadable: (p3st.params as { inheritedSlot?: unknown })
        .inheritedSlot,
      frozen: Object.isFrozen(p3st.params),
    });

    let wroteKeys: string[] = [];
    const p3b = run((ch) => {
      wroteKeys = Object.keys(ch.params);

      return ch;
    });
    const p3bst = p3b.st as { params: Record<string, unknown> };

    say("D3·P3 · ядро после выдачи в контейнер НЕ пишет", {
      keysAtHandout: wroteKeys,
      keysInPublished: Object.keys(p3bst.params),
    });

    // --- P4
    let frozenAtHandout: boolean | undefined;
    const p4 = run((ch) => {
      frozenAtHandout = Object.isFrozen(ch.params);
      ch.params.nestedCaller = { z: 1 };

      return ch;
    });
    const p4st = p4.st as { params: Record<string, unknown> };

    say("D3·P4 · уровень ядра frozen В МОМЕНТ выдачи кодеку", frozenAtHandout);
    say("D3·P4 · уровень ядра frozen в опубликованном state", {
      frozen: Object.isFrozen(p4st.params),
      nestedPresent: p4st.params.nestedCaller !== undefined,
      nestedFrozen: Object.isFrozen(p4st.params.nestedCaller),
    });
  }
}

void main();
