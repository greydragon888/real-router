// МАТРИЦА семейства «params·normalizeChannel».
// Строки — семь дверей переписи, столбцы — эксперимент (а), P1, P2, P3, P4.
//
// Общая шапка позитивных контролей: КАЖДЫЙ драйвер сначала прогоняется на
// простом легальном мешке ({ id: "7" }) и печатает `control` — если контроль не
// даёт ожидаемого следствия (href '/u/7', state.name 'u', predicate true),
// строка матрицы недействительна. Плюс доказательство ДОСТИЖЕНИЯ ветки:
// счётчик чтений > 0 в столбцах 7/8.
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import {
  countingBag,
  countingProxy,
  driftingBag,
} from "../../../../packages/core/tests/helpers/hostileBags";

type Bag = Record<string, unknown>;
type Obs = Record<string, unknown>;

const ROUTES = [
  { name: "u", path: "/u/:id?tab" },
  { name: "plain", path: "/plain/:id" },
] as never;

const mk = () => createRouter(ROUTES, {} as never);

const keysOf = (o: unknown): string[] =>
  o && typeof o === "object" ? Object.keys(o as object) : [];

type Driver = {
  id: string;
  /** true, если дверь приземляет объект в ячейку ядра (getState). */
  commits: boolean;
  run: (bag: Bag | undefined) => Promise<Obs> | Obs;
};

const DRIVERS: Driver[] = [
  {
    id: "Router.navigate·routeParams",
    commits: true,
    run: async (bag) => {
      const r = mk();
      r.start("/plain/1");
      let outcome = "OK";
      let st: unknown;
      try {
        st = await r.navigate("u", bag as never);
      } catch (e) {
        outcome = `REJECT ${String((e as Error).message).slice(0, 70)}`;
      }
      const s = r.getState() as Obs | null;
      return {
        outcome,
        returnedPath: (st as Obs | undefined)?.path,
        statePath: s?.path,
        stateParams: s?.params,
        stateParamsKeys: keysOf(s?.params),
        stateSearch: s?.search,
        stateMetaKeys: keysOf(s?.meta),
        stateContext: s?.context,
        containerIdentity: (s?.params as unknown) === (bag as unknown),
        paramsFrozen: Object.isFrozen(s?.params),
      };
    },
  },
  {
    id: "Router.canNavigateTo·params",
    commits: false,
    run: (bag) => {
      const r = mk();
      r.start("/plain/1");
      let verdict: unknown;
      try {
        verdict = r.canNavigateTo("u", bag as never);
      } catch (e) {
        verdict = `THROW ${String((e as Error).message).slice(0, 70)}`;
      }
      return { verdict, statePath: (r.getState() as Obs | null)?.path };
    },
  },
  {
    id: "Router.buildPath·params",
    commits: false,
    run: (bag) => {
      const r = mk();
      let href: unknown;
      try {
        href = r.buildPath("u", bag as never);
      } catch (e) {
        href = `THROW ${String((e as Error).message).slice(0, 70)}`;
      }
      return { href };
    },
  },
  {
    id: "Router.isActiveRoute·params",
    commits: false,
    run: (bag) => {
      const r = mk();
      // ⚠ Роутер стартован НА целевом маршруте — иначе ранний выход и мешок
      // до normalizeChannel не доходит (ложный ноль чтений).
      r.start("/u/7?tab=x");
      let verdict: unknown;
      try {
        verdict = r.isActiveRoute("u", bag as never);
      } catch (e) {
        verdict = `THROW ${String((e as Error).message).slice(0, 70)}`;
      }
      return { verdict, startedAt: (r.getState() as Obs | null)?.path };
    },
  },
  {
    id: "PluginApi.makeState·params",
    commits: false,
    run: (bag) => {
      const api = getPluginApi(mk());
      let st: Obs | undefined;
      let outcome = "OK";
      try {
        st = api.makeState(
          "u",
          bag as never,
          undefined as never,
          "/u/7",
        ) as Obs;
      } catch (e) {
        outcome = `THROW ${String((e as Error).message).slice(0, 70)}`;
      }
      return {
        outcome,
        name: st?.name,
        params: st?.params,
        paramsKeys: keysOf(st?.params),
        containerIdentity: (st?.params as unknown) === (bag as unknown),
        paramsFrozen: st ? Object.isFrozen(st.params) : undefined,
      };
    },
  },
  {
    id: "PluginApi.buildNavigationState·params",
    commits: false,
    run: (bag) => {
      const api = getPluginApi(mk());
      let st: Obs | undefined;
      let outcome = "OK";
      try {
        st = api.buildNavigationState("u", bag as never) as Obs;
      } catch (e) {
        outcome = `THROW ${String((e as Error).message).slice(0, 70)}`;
      }
      return {
        outcome,
        path: st?.path,
        params: st?.params,
        paramsKeys: keysOf(st?.params),
        containerIdentity: (st?.params as unknown) === (bag as unknown),
        paramsFrozen: st ? Object.isFrozen(st.params) : undefined,
      };
    },
  },
  {
    id: "RouterInternals.makeState·params",
    commits: false,
    run: (bag) => {
      const ctx = getInternals(mk() as never);
      let st: Obs | undefined;
      let outcome = "OK";
      try {
        st = ctx.makeState(
          "u",
          bag as never,
          undefined as never,
          "/u/7",
        ) as Obs;
      } catch (e) {
        outcome = `THROW ${String((e as Error).message).slice(0, 70)}`;
      }
      return {
        outcome,
        name: st?.name,
        params: st?.params,
        paramsKeys: keysOf(st?.params),
        containerIdentity: (st?.params as unknown) === (bag as unknown),
        paramsFrozen: st ? Object.isFrozen(st.params) : undefined,
      };
    },
  },
];

const out: Record<string, unknown> = {};

async function main(): Promise<void> {
  // ==========================================================================
  // 0. ШАПКА: позитивный контроль каждого драйвера на легальном мешке.
  // ==========================================================================
  const control: Record<string, unknown> = {};
  for (const d of DRIVERS) {
    control[d.id] = await d.run({ id: "7" });
  }
  out["0·positiveControl"] = control;

  // ==========================================================================
  // 1. ЭКСПЕРИМЕНТ (а): предварительно СКОПИРОВАННЫЙ контейнер против
  // оригинала. Листья — те же ссылки. Плюс обратная видимость мутаций.
  // ==========================================================================
  const expA: Record<string, unknown> = {};
  for (const d of DRIVERS) {
    const leaf = { deep: 1 };
    const original: Bag = { id: "7", extra: leaf };
    const shallowCopy: Bag = { ...original };

    const withOriginal = (await d.run(original)) as Obs;
    const withCopy = (await d.run(shallowCopy)) as Obs;

    // Обратная видимость: мутируем ОРИГИНАЛ ПОСЛЕ вызова.
    const bag: Bag = { id: "7" };
    const res = (await d.run(bag)) as Obs;
    const published = (res.stateParams ?? res.params) as Bag | undefined;
    bag.id = "MUTATED";
    bag.late = "added";

    // И наоборот: пробуем мутировать то, что ядро отдало.
    let writeBackAllowed: unknown = "n/a";
    if (published) {
      try {
        (published as Bag).id = "WRITTEN_BACK";
        writeBackAllowed = (published as Bag).id === "WRITTEN_BACK";
      } catch (e) {
        writeBackAllowed = `THROW ${String((e as Error).message).slice(0, 40)}`;
      }
    }

    const pub = (withOriginal.stateParams ?? withOriginal.params) as
      | Bag
      | undefined;

    expA[d.id] = {
      identicalObservables:
        JSON.stringify(withOriginal) === JSON.stringify(withCopy),
      withOriginal,
      withCopy,
      leafByReference: pub?.extra === leaf,
      coreSeesLaterMutation: published
        ? published.id === "MUTATED" || "late" in published
        : "n/a (no container handed out)",
      writeBackAllowed,
    };
  }
  out["1·experimentA"] = expA;

  // ==========================================================================
  // 2. P1: ДРЕЙФУЮЩИЙ мешок по КАЖДОМУ ключу контейнера.
  // first = { id:"7", tab: undefined } → гейт P1 видит undefined и пропускает;
  // then  = { id:"9", tab:"x" }        → второе чтение вернуло бы другое.
  // reads[k] ≤ 1 ⇔ P1 держится. Контроль — необъявленный ключ zzz.
  // ==========================================================================
  const p1: Record<string, unknown> = {};
  for (const d of DRIVERS) {
    const declared = driftingBag(
      { id: "7", tab: undefined },
      { id: "9", tab: "x" },
    );
    const resD = await d.run(declared.bag as Bag);
    const plain = driftingBag({ id: "7", zzz: "a" }, { id: "9", zzz: "b" });
    const resP = await d.run(plain.bag as Bag);
    p1[d.id] = {
      declaredQueryKeyInPathBag: { reads: declared.reads, result: resD },
      controlUndeclaredKey: { reads: plain.reads, result: resP },
    };
  }
  out["2·P1"] = p1;

  // ==========================================================================
  // 3. P2: ЛГУЩИЙ Proxy — ownKeys НЕ называет `leaked`, gOPD утверждает, что он
  // собственный/перечислимый/configurable. Ключ НЕ должен попасть в ответ.
  // Позитивный контроль — тот же Proxy, но ownKeys `leaked` НАЗЫВАЕТ.
  // ==========================================================================
  const p2: Record<string, unknown> = {};
  const lyingBag = (honest: boolean): { bag: Bag; asked: string[] } => {
    const asked: string[] = [];
    const target: Bag = { id: "7" };
    if (honest) {
      target.leaked = "LEAKED";
    }
    const bag = new Proxy(target, {
      ownKeys(t) {
        asked.push("ownKeys");
        return Reflect.ownKeys(t);
      },
      getOwnPropertyDescriptor(t, k) {
        asked.push(`gOPD:${String(k)}`);
        if (k === "leaked") {
          return {
            value: "LEAKED",
            enumerable: true,
            configurable: true,
            writable: true,
          };
        }
        return Reflect.getOwnPropertyDescriptor(t, k);
      },
      get(t, k, rec) {
        asked.push(`get:${String(k)}`);
        if (k === "leaked") return "LEAKED";
        return Reflect.get(t, k, rec);
      },
      has(t, k) {
        asked.push(`has:${String(k)}`);
        return k === "leaked" || Reflect.has(t, k);
      },
    }) as Bag;
    return { bag, asked };
  };

  for (const d of DRIVERS) {
    const lying = lyingBag(false);
    const resL = (await d.run(lying.bag)) as Obs;
    const honest = lyingBag(true);
    const resH = (await d.run(honest.bag)) as Obs;
    p2[d.id] = {
      lying: {
        asked: lying.asked,
        leakedInResult: JSON.stringify(resL).includes("LEAKED"),
        result: resL,
      },
      controlHonestOwnKeys: {
        asked: honest.asked,
        leakedInResult: JSON.stringify(resH).includes("LEAKED"),
        result: resH,
      },
    };
  }
  out["3·P2"] = p2;

  // ==========================================================================
  // 4. P3a: УНАСЛЕДОВАННЫЙ аксессор под именем ключа на Object.prototype.
  // Запись ядра не должна уйти в сеттер и не должна бросить.
  // Позитивный контроль ЖИВОСТИ аксессора — [[Set]] в чистый литерал.
  // ==========================================================================
  const p3a: Record<string, unknown> = {};
  for (const d of DRIVERS) {
    let setterHits = 0;
    let controlHits = 0;
    let res: unknown;
    let thrown: string | null = null;
    try {
      Object.defineProperty(Object.prototype, "id", {
        configurable: true,
        get(): unknown {
          return "FROM_PROTO";
        },
        set(): void {
          setterHits += 1;
        },
      });
      const victim: Bag = {};
      victim.id = "x";
      controlHits = setterHits;
      setterHits = 0;
      try {
        res = await d.run({ id: "7" });
      } catch (e) {
        thrown = String((e as Error).message).slice(0, 80);
      }
    } finally {
      delete (Object.prototype as Bag).id;
    }
    p3a[d.id] = {
      accessorLiveControlHits: controlHits,
      setterHitsDuringDoor: setterHits,
      thrown,
      result: res,
    };
  }
  out["4·P3a-inherited-accessor"] = p3a;

  // ==========================================================================
  // 5. P3b: собственный ключ "__proto__" из JSON.parse.
  // ==========================================================================
  const p3b: Record<string, unknown> = {};
  for (const d of DRIVERS) {
    const bag = JSON.parse('{"id":"7","__proto__":{"polluted":true}}') as Bag;
    const res = (await d.run(bag)) as Obs;
    const published = (res.stateParams ?? res.params) as Bag | undefined;
    p3b[d.id] = {
      bagHasOwnProto: Object.hasOwn(bag, "__proto__"),
      publishedKeys: keysOf(published),
      publishedProtoIsObjectPrototype: published
        ? Object.getPrototypeOf(published) === Object.prototype
        : undefined,
      globalPolluted: (({}) as Bag).polluted !== undefined,
      result: res,
    };
  }
  out["5·P3b-own-__proto__"] = p3b;

  // ==========================================================================
  // 6. P4: глубина заморозки.
  // ==========================================================================
  const p4: Record<string, unknown> = {};
  for (const d of DRIVERS) {
    const leaf = { deep: 1 };
    const bag: Bag = { id: "7", extra: leaf };
    const before = {
      bagFrozen: Object.isFrozen(bag),
      leafFrozen: Object.isFrozen(leaf),
    };
    const res = (await d.run(bag)) as Obs;
    const published = (res.stateParams ?? res.params) as Bag | undefined;
    p4[d.id] = {
      before,
      callerBagFrozenAfter: Object.isFrozen(bag),
      callerLeafFrozenAfter: Object.isFrozen(leaf),
      coreBornLevelFrozen: published
        ? Object.isFrozen(published)
        : "n/a (no State handed out)",
      leafIdentityInPublished: published?.extra === leaf,
      result: res,
    };
  }
  out["6·P4"] = p4;

  // ==========================================================================
  // 7. Копия контейнера !== мешок вызывающего (общий столбец).
  // ==========================================================================
  const ident: Record<string, unknown> = {};
  for (const d of DRIVERS) {
    const bag: Bag = { id: "7" };
    const res = (await d.run(bag)) as Obs;
    const published = (res.stateParams ?? res.params) as Bag | undefined;
    const counted = countingBag({ id: "7" });
    const res2 = (await d.run(counted.bag as Bag)) as Obs;
    ident[d.id] = {
      publishedIsCallerBag: (published as unknown) === (bag as unknown),
      publishedExists: published !== undefined,
      readsProveReached: counted.reads,
      res2Outcome: res2.outcome ?? res2.verdict ?? res2.href,
    };
  }
  out["7·containerIdentity"] = ident;

  // ==========================================================================
  // 8. countingProxy: второй инструмент чтения (get-трап), контроль первого.
  // ==========================================================================
  const cp: Record<string, unknown> = {};
  for (const d of DRIVERS) {
    const p = countingProxy({ id: "7" } as Bag);
    const res = (await d.run(p.bag as Bag)) as Obs;
    cp[d.id] = {
      reads: p.reads,
      outcome: res.outcome ?? res.verdict ?? res.href,
    };
  }
  out["8·countingProxy"] = cp;

  console.log(JSON.stringify(out, null, 1));
}

void main();
