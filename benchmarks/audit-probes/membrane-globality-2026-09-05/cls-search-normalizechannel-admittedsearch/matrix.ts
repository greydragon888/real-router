// МАТРИЦА семейства «search·normalizeChannel+admittedSearch».
// Строки — семь дверей переписи, столбцы — эксперимент (а), P1, P2, P3, P4,
// плюс СЕМЕЙНЫЙ столбец: печатает ли режимный гейт ключ, которого активный
// queryParamsMode не допускает (state.search ⊆ state.path) при ЛГУЩЕМ мешке.
//
// ⚠ ПОЗИТИВНЫЙ КОНТРОЛЬ ДОСТИЖИМОСТИ ГЕЙТА. Дефолт queryParamsMode — "loose"
// (OptionsNamespace/constants.ts), а canonicalize.ts зовёт admittedSearch
// ТОЛЬКО когда port.admitsUndeclaredQuery() === false. Поэтому вся матрица
// гоняется на роутере с queryParamsMode: "default" (гейт РАБОТАЕТ), и отдельной
// строкой — тот же вход на "loose" (гейт ПРОПУЩЕН): расхождение двух прогонов
// доказывает, что вход дошёл ДО гейта, а не мимо.
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

// `tab` ОБЪЯВЛЕН маршрутом, `zzz` — нет: под "default" гейт роняет `zzz`.
const ROUTES = [
  { name: "u", path: "/u/:id?tab" },
  { name: "plain", path: "/plain/:id" },
] as never;

const PARAMS = { id: "7" } as never;

type Mode = "default" | "loose";
let MODE: Mode = "default";

const mk = () => createRouter(ROUTES, { queryParamsMode: MODE } as never);

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
    id: "Router.navigate·routeSearch",
    commits: true,
    run: async (bag) => {
      const r = mk();
      r.start("/plain/1");
      let outcome = "OK";
      let st: unknown;
      try {
        st = await r.navigate("u", PARAMS, bag as never);
      } catch (e) {
        outcome = `REJECT ${String((e as Error).message).slice(0, 70)}`;
      }
      const s = r.getState() as Obs | null;
      return {
        outcome,
        returnedPath: (st as Obs | undefined)?.path,
        statePath: s?.path,
        stateSearch: s?.search,
        stateSearchKeys: keysOf(s?.search),
        stateParams: s?.params,
        containerIdentity: (s?.search as unknown) === (bag as unknown),
        searchFrozen: Object.isFrozen(s?.search),
      };
    },
  },
  {
    id: "Router.canNavigateTo·search",
    commits: false,
    run: (bag) => {
      const r = mk();
      r.start("/plain/1");
      let verdict: unknown;
      try {
        verdict = r.canNavigateTo("u", PARAMS, bag as never);
      } catch (e) {
        verdict = `THROW ${String((e as Error).message).slice(0, 70)}`;
      }
      return { verdict, statePath: (r.getState() as Obs | null)?.path };
    },
  },
  {
    id: "Router.buildPath·search",
    commits: false,
    run: (bag) => {
      const r = mk();
      let href: unknown;
      try {
        href = r.buildPath("u", PARAMS, bag as never);
      } catch (e) {
        href = `THROW ${String((e as Error).message).slice(0, 70)}`;
      }
      return { href };
    },
  },
  {
    id: "Router.isActiveRoute·search",
    commits: false,
    run: (bag) => {
      const r = mk();
      // ⚠ Роутер стартован НА целевом маршруте — иначе ранний выход и мешок
      // до normalizeChannel не доходит (ложный ноль чтений).
      r.start("/u/7?tab=x");
      let verdict: unknown;
      try {
        verdict = r.isActiveRoute("u", PARAMS, bag as never);
      } catch (e) {
        verdict = `THROW ${String((e as Error).message).slice(0, 70)}`;
      }
      return { verdict, startedAt: (r.getState() as Obs | null)?.path };
    },
  },
  {
    id: "PluginApi.makeState·search",
    commits: false,
    run: (bag) => {
      const api = getPluginApi(mk());
      let st: Obs | undefined;
      let outcome = "OK";
      try {
        st = api.makeState("u", PARAMS, bag as never, "/u/7") as Obs;
      } catch (e) {
        outcome = `THROW ${String((e as Error).message).slice(0, 70)}`;
      }
      return {
        outcome,
        name: st?.name,
        search: st?.search,
        searchKeys: keysOf(st?.search),
        containerIdentity: (st?.search as unknown) === (bag as unknown),
        searchFrozen: st ? Object.isFrozen(st.search) : undefined,
      };
    },
  },
  {
    id: "PluginApi.buildNavigationState·search",
    commits: false,
    run: (bag) => {
      const api = getPluginApi(mk());
      let st: Obs | undefined;
      let outcome = "OK";
      try {
        st = api.buildNavigationState("u", PARAMS, bag as never) as Obs;
      } catch (e) {
        outcome = `THROW ${String((e as Error).message).slice(0, 70)}`;
      }
      return {
        outcome,
        path: st?.path,
        search: st?.search,
        searchKeys: keysOf(st?.search),
        containerIdentity: (st?.search as unknown) === (bag as unknown),
        searchFrozen: st ? Object.isFrozen(st.search) : undefined,
      };
    },
  },
  {
    id: "RouterInternals.makeState·search",
    commits: false,
    run: (bag) => {
      const ctx = getInternals(mk() as never);
      let st: Obs | undefined;
      let outcome = "OK";
      try {
        st = ctx.makeState("u", PARAMS, bag as never, "/u/7") as Obs;
      } catch (e) {
        outcome = `THROW ${String((e as Error).message).slice(0, 70)}`;
      }
      return {
        outcome,
        name: st?.name,
        search: st?.search,
        searchKeys: keysOf(st?.search),
        containerIdentity: (st?.search as unknown) === (bag as unknown),
        searchFrozen: st ? Object.isFrozen(st.search) : undefined,
      };
    },
  },
];

const published = (res: Obs): Bag | undefined =>
  (res.stateSearch ?? res.search) as Bag | undefined;

const out: Record<string, unknown> = {};

async function main(): Promise<void> {
  // ==========================================================================
  // 0. ШАПКА: позитивный контроль каждого драйвера на легальном мешке
  // { tab: "x" } — ОБЪЯВЛЕННЫЙ ключ, гейт его допускает.
  // ==========================================================================
  const control: Record<string, unknown> = {};
  for (const d of DRIVERS) {
    control[d.id] = await d.run({ tab: "x" });
  }
  out["0·positiveControl·declaredKey"] = control;

  // ==========================================================================
  // 0b. КОНТРОЛЬ ДОСТИЖИМОСТИ ГЕЙТА: необъявленный ключ `zzz` на "default"
  // (должен быть уронен) против того же входа на "loose" (должен пройти).
  // Расхождение = вход ДОШЁЛ до admittedSearch.
  // ==========================================================================
  const gate: Record<string, unknown> = {};
  for (const d of DRIVERS) {
    MODE = "default";
    const gated = await d.run({ tab: "x", zzz: "UNDECLARED" });
    MODE = "loose";
    const loose = await d.run({ tab: "x", zzz: "UNDECLARED" });
    MODE = "default";
    gate[d.id] = {
      gatedMode: gated,
      looseMode: loose,
      gateDiscriminates: JSON.stringify(gated) !== JSON.stringify(loose),
    };
  }
  out["0b·gateReachability"] = gate;

  // ==========================================================================
  // 1. ЭКСПЕРИМЕНТ (а): предварительно СКОПИРОВАННЫЙ контейнер против
  // оригинала. Листья — те же ссылки. Плюс обратная видимость мутаций.
  // ==========================================================================
  const expA: Record<string, unknown> = {};
  for (const d of DRIVERS) {
    const leaf = ["a", "b"];
    const original: Bag = { tab: leaf };
    const shallowCopy: Bag = { ...original };

    const withOriginal = (await d.run(original)) as Obs;
    const withCopy = (await d.run(shallowCopy)) as Obs;

    // Обратная видимость: мутируем ОРИГИНАЛ ПОСЛЕ вызова.
    const bag: Bag = { tab: "x" };
    const res = (await d.run(bag)) as Obs;
    const pub = published(res);
    bag.tab = "MUTATED";
    bag.late = "added";

    // И наоборот: пробуем мутировать то, что ядро отдало.
    let writeBackAllowed: unknown = "n/a";
    if (pub) {
      try {
        (pub as Bag).tab = "WRITTEN_BACK";
        writeBackAllowed = (pub as Bag).tab === "WRITTEN_BACK";
      } catch (e) {
        writeBackAllowed = `THROW ${String((e as Error).message).slice(0, 40)}`;
      }
    }

    const pubO = published(withOriginal);

    expA[d.id] = {
      identicalObservables:
        JSON.stringify(withOriginal) === JSON.stringify(withCopy),
      withOriginal,
      withCopy,
      leafByReference: pubO?.tab === leaf,
      leafFrozenAfter: Object.isFrozen(leaf),
      coreSeesLaterMutation: pub
        ? pub.tab === "MUTATED" || "late" in pub
        : "n/a (no container handed out)",
      writeBackAllowed,
    };
  }
  out["1·experimentA"] = expA;

  // ==========================================================================
  // 2. P1: ДРЕЙФУЮЩИЙ мешок по КАЖДОМУ ключу контейнера.
  // first = { tab: "FIRST" } → then = { tab: "SECOND" }: второе чтение вернуло
  // бы другое значение. reads[k] ≤ 1 И наблюдаемое значение = FIRST ⇔ P1.
  // Контроль — необъявленный ключ zzz (проходит через гейт по другой ветке).
  // ==========================================================================
  const p1: Record<string, unknown> = {};
  for (const d of DRIVERS) {
    const declared = driftingBag({ tab: "FIRST" }, { tab: "SECOND" });
    const resD = await d.run(declared.bag as Bag);
    const mixed = driftingBag(
      { tab: "FIRST", zzz: "F" },
      { tab: "SECOND", zzz: "S" },
    );
    const resM = await d.run(mixed.bag as Bag);
    p1[d.id] = {
      declaredOnly: { reads: declared.reads, result: resD },
      declaredPlusDropped: { reads: mixed.reads, result: resM },
    };
  }
  out["2·P1"] = p1;

  // ==========================================================================
  // 3. P2: ЛГУЩИЙ Proxy — ownKeys НЕ называет `tab`, gOPD утверждает, что он
  // собственный/перечислимый/configurable. Ключ НЕ должен попасть в состояние.
  // ⚠ Имя лгущего ключа — ОБЪЯВЛЕННОЕ `tab`: иначе гейт уронил бы его и по
  // второй причине, и проба перестала бы различать P2.
  // Позитивный контроль — тот же Proxy, но ownKeys `tab` НАЗЫВАЕТ.
  // ==========================================================================
  const p2: Record<string, unknown> = {};
  const lyingBag = (honest: boolean): { bag: Bag; asked: string[] } => {
    const asked: string[] = [];
    const target: Bag = {};
    if (honest) {
      target.tab = "LEAKED";
    }
    const bag = new Proxy(target, {
      ownKeys(t) {
        asked.push("ownKeys");
        return Reflect.ownKeys(t);
      },
      getOwnPropertyDescriptor(t, k) {
        asked.push(`gOPD:${String(k)}`);
        if (k === "tab") {
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
        if (k === "tab") return "LEAKED";
        return Reflect.get(t, k, rec);
      },
      has(t, k) {
        asked.push(`has:${String(k)}`);
        return k === "tab" || Reflect.has(t, k);
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
  // 4. P3a: УНАСЛЕДОВАННЫЙ аксессор под именем ОБЪЯВЛЕННОГО ключа `tab` на
  // Object.prototype — ровно тот случай, о котором говорит докблок
  // admittedSearch (аккумулятор — обычный `{}`). Запись ядра не должна уйти
  // в сеттер и не должна бросить.
  // Позитивный контроль ЖИВОСТИ аксессора — [[Set]] в чистый литерал.
  // ==========================================================================
  const p3a: Record<string, unknown> = {};
  for (const d of DRIVERS) {
    let setterHits = 0;
    let controlHits = 0;
    let res: unknown;
    let thrown: string | null = null;
    try {
      Object.defineProperty(Object.prototype, "tab", {
        configurable: true,
        get(): unknown {
          return "FROM_PROTO";
        },
        set(): void {
          setterHits += 1;
        },
      });
      const victim: Bag = {};
      victim.tab = "x";
      controlHits = setterHits;
      setterHits = 0;
      try {
        res = await d.run({ tab: "x" });
      } catch (e) {
        thrown = String((e as Error).message).slice(0, 90);
      }
    } finally {
      delete (Object.prototype as Bag).tab;
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
  // 5. P3b: собственный ключ "__proto__" из JSON.parse в search-мешке.
  // ==========================================================================
  const p3b: Record<string, unknown> = {};
  for (const d of DRIVERS) {
    const bag = JSON.parse(
      '{"tab":"x","__proto__":{"polluted":true}}',
    ) as Bag;
    const res = (await d.run(bag)) as Obs;
    const pub = published(res);
    p3b[d.id] = {
      bagHasOwnProto: Object.hasOwn(bag, "__proto__"),
      publishedKeys: keysOf(pub),
      publishedProtoIsObjectPrototype: pub
        ? Object.getPrototypeOf(pub) === Object.prototype
        : undefined,
      globalPolluted: (({}) as Bag).polluted !== undefined,
      result: res,
    };
  }
  out["5·P3b-own-__proto__"] = p3b;

  // ==========================================================================
  // 6. P4: глубина заморозки. Вложенный контейнер вызывающего (массив-значение)
  // не должен стать frozen; уровень, порождённый ядром, — должен.
  // ==========================================================================
  const p4: Record<string, unknown> = {};
  for (const d of DRIVERS) {
    const leaf = ["a", "b"];
    const bag: Bag = { tab: leaf };
    const before = {
      bagFrozen: Object.isFrozen(bag),
      leafFrozen: Object.isFrozen(leaf),
    };
    const res = (await d.run(bag)) as Obs;
    const pub = published(res);
    p4[d.id] = {
      before,
      callerBagFrozenAfter: Object.isFrozen(bag),
      callerLeafFrozenAfter: Object.isFrozen(leaf),
      coreBornLevelFrozen: pub
        ? Object.isFrozen(pub)
        : "n/a (no State handed out)",
      leafIdentityInPublished: pub?.tab === leaf,
      result: res,
    };
  }
  out["6·P4"] = p4;

  // ==========================================================================
  // 7. Копия контейнера !== мешок вызывающего (общий столбец) + доказательство
  // ДОСТИЖЕНИЯ ветки счётчиком чтений.
  // ==========================================================================
  const ident: Record<string, unknown> = {};
  for (const d of DRIVERS) {
    const bag: Bag = { tab: "x" };
    const res = (await d.run(bag)) as Obs;
    const pub = published(res);
    const counted = countingBag({ tab: "x" });
    const res2 = (await d.run(counted.bag as Bag)) as Obs;
    ident[d.id] = {
      publishedIsCallerBag: (pub as unknown) === (bag as unknown),
      publishedExists: pub !== undefined,
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
    const p = countingProxy({ tab: "x" } as Bag);
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
