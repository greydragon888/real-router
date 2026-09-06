// Семейство «порт-и-матчер · печатающие двери ниже normalizeChannel».
// Строки B и C: RouterInternals.port().resolveForward·params|search и
// RouterInternals.port().buildPath·params|search — мешки ВЫЗЫВАЮЩЕГО, входящие
// прямым вызовом через getInternals, МИМО фасадного normalizeChannel.
//
// Столбцы: эксперимент (а) · P1 · P2 · P3 · P4. В каждой ячейке позитивный
// контроль и доказательство, что вход дошёл до проверяемой ветки.
import { createRouter } from "@real-router/core";
import { getInternals } from "@real-router/core/validation";

import {
  countingBag,
  driftingBag,
} from "../../../../packages/core/tests/helpers/hostileBags";

type AnyRec = Record<string, unknown>;

const out: AnyRec = {};
const t = (fn: () => unknown): string => {
  try {
    fn();

    return "no-throw";
  } catch (error) {
    return `throw:${(error as Error).constructor.name}:${(error as Error).message.slice(0, 70)}`;
  }
};

/**
 * ЛГУЩИЙ Proxy (#1854): `ownKeys` НЕ называет ключ, а
 * `getOwnPropertyDescriptor` утверждает, что он собственный. Инструмент
 * различает дверь, которая перечисляет через ownKeys, от двери, которая
 * спрашивает hasOwn про ключ ВЫЗЫВАЮЩЕГО.
 */
function lyingBag<T extends AnyRec>(source: T, hidden: string): T {
  return new Proxy(source, {
    ownKeys: (target) => Reflect.ownKeys(target).filter((k) => k !== hidden),
    getOwnPropertyDescriptor: (target, key) =>
      key === hidden
        ? { value: target[hidden], writable: true, enumerable: true, configurable: true }
        : Reflect.getOwnPropertyDescriptor(target, key),
  }) as T;
}

function build() {
  const router = createRouter(
    [
      { name: "home", path: "/home" },
      { name: "u", path: "/u/:id?tab" },
      // форвардящая цепочка со СВОИМИ дефолтами на обоих каналах —
      // #layerChainDefaults читает мешок вызывающего именно здесь
      {
        name: "src",
        path: "/src/:id",
        forwardTo: "dst",
        defaultParams: { id: "chain-id" },
        defaultSearch: { q: "chain-q" },
      },
      { name: "dst", path: "/dst/:id?q" },
    ] as never,
    { defaultRoute: "home" } as never,
    {} as never,
  );

  return { router, ctx: getInternals(router) };
}

function main(): void {
  // ================= B. port().resolveForward =================

  // --- B0 ПОЗИТИВНЫЙ КОНТРОЛЬ: обе ветки достижимы.
  {
    const { ctx } = build();
    const port = ctx.port();

    out["B0.control"] = {
      forwardingRoute: port.resolveForward("src", { id: "7" }, { z: "1" }),
      plainRoute: port.resolveForward("u", { id: "7" }, { tab: "x" }),
    };
  }

  // --- B1 идентичность на выходе.
  {
    const { ctx } = build();
    const port = ctx.port();
    const bag = { id: "7" };
    const search = { tab: "x" };
    const plain = port.resolveForward("u", bag, search);
    const fwdBag = { id: "7" };
    const fwd = port.resolveForward("src", fwdBag, { z: "1" });

    out["B1.identity"] = {
      plainParamsIsCallersObject: plain.params === bag,
      plainSearchIsCallersObject: plain.search === search,
      forwardingParamsIsCallersObject: fwd.params === fwdBag,
      forwardingParams: fwd.params,
      callerBagFrozenAfter: Object.isFrozen(bag),
      resultParamsFrozen: Object.isFrozen(plain.params),
    };
  }

  // --- B2 ЭКСПЕРИМЕНТ (а): оригинал против ЗАРАНЕЕ СКОПИРОВАННОГО контейнера.
  {
    const { ctx } = build();
    const port = ctx.port();
    const leaf = { svc: 1 };
    const orig = { id: "7", leaf } as AnyRec;
    const copy = { ...orig };

    const rOrig = port.resolveForward("src", orig as never, { z: "1" });
    const rCopy = port.resolveForward("src", copy as never, { z: "1" });

    // ОБРАТНАЯ ВИДИМОСТЬ: мутируем оригинал ПОСЛЕ вызова.
    orig["id"] = "MUTATED";

    out["B2.copy-experiment"] = {
      sameName: rOrig.name === rCopy.name,
      sameParamsJson:
        JSON.stringify(rOrig.params) === JSON.stringify(rCopy.params),
      sameSearchJson:
        JSON.stringify(rOrig.search) === JSON.stringify(rCopy.search),
      leafIdentityKept: (rCopy.params as AnyRec)["leaf"] === leaf,
      // на форвардящем маршруте ядро уже вернуло СВОЙ объект (#layerChainDefaults)
      origResultIsCallersObject: (rOrig.params as unknown) === (orig as unknown),
      resultAfterCallerMutation: rOrig.params,
      // фасадный близнец: тот же интент через дверь, у которой горло ЕСТЬ
      facadeTwinOriginal: (() => {
        const b = build();

        return b.router.buildPath("src", { id: "7" } as never);
      })(),
      facadeTwinCopy: (() => {
        const b = build();
        const src = { id: "7" };

        return b.router.buildPath("src", { ...src } as never);
      })(),
    };
  }

  // --- B3 P1: счёт чтений на ключ + ДРЕЙФУЮЩИЙ мешок.
  {
    const { ctx } = build();
    const port = ctx.port();
    const plain = countingBag({ id: "7", extra: "e" });
    const rPlain = port.resolveForward("u", plain.bag as never, undefined);
    // счёт снимается ДО того, как проба сама прочитает результат
    const plainCoreReads = { ...plain.reads };
    const plainSnapshot = { ...(rPlain.params as AnyRec) };

    const fwd = countingBag({ id: "7", extra: "e" });
    const rFwd = port.resolveForward("src", fwd.bag as never, undefined);
    const fwdCoreReads = { ...fwd.reads };
    const fwdSnapshot = { ...(rFwd.params as AnyRec) };

    const drift = driftingBag({ id: "FIRST" }, { id: "SECOND" });
    const rDrift = port.resolveForward("src", drift.bag as never, undefined);
    const driftCoreReads = { ...drift.reads };
    const driftSnapshot = { ...(rDrift.params as AnyRec) };

    // ПОЗИТИВНЫЙ КОНТРОЛЬ инструмента: та же дверь, где ядро ОБЯЗАНО читать —
    // форвардящий маршрут с дефолтом хопа и мешок, где слот пуст.
    const merged = countingBag({ extra: "e" });
    const rMerged = port.resolveForward("src", merged.bag as never, undefined);
    const mergedCoreReads = { ...merged.reads };

    out["B3.P1"] = {
      plainCoreReads,
      plainSnapshot,
      fwdCoreReads,
      fwdSnapshot,
      driftCoreReads,
      driftSnapshot,
      mergedCoreReads,
      mergedParams: { ...(rMerged.params as AnyRec) },
    };
  }

  // --- B4 P2: лгущий Proxy — ownKeys прячет `extra`, gOPD зовёт его собственным.
  {
    const { ctx } = build();
    const port = ctx.port();
    const lying = lyingBag({ id: "7", extra: "e" }, "extra");
    const r = port.resolveForward("src", lying as never, undefined);
    const landed = { ...(r.params as AnyRec) };
    // контроль: тот же мешок без лжи
    const honest = port.resolveForward(
      "src",
      { id: "7", extra: "e" } as never,
      undefined,
    );

    out["B4.P2"] = {
      landedKeys: Object.keys(landed),
      landedHasHiddenKey: Object.hasOwn(landed, "extra"),
      controlHonestKeys: Object.keys(honest.params as AnyRec),
    };
  }

  // --- B5 P3: унаследованный аксессор + собственный "__proto__".
  {
    const { ctx } = build();
    const port = ctx.port();
    const hits: string[] = [];

    Object.defineProperty(Object.prototype, "id", {
      configurable: true,
      get(): unknown {
        hits.push("get");

        return "INHERITED";
      },
      set(): void {
        hits.push("set");
      },
    });

    let verdict: string;
    let landed: AnyRec = {};

    try {
      // мешок БЕЗ собственного `id`: цепочка обязана дописать дефолт хопа
      verdict = t(() => {
        const r = port.resolveForward("src", {} as never, undefined);

        landed = { ...(r.params as AnyRec) };
      });
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete (Object.prototype as AnyRec)["id"];
    }

    // собственный "__proto__" из JSON.parse
    const polluted = JSON.parse('{"id":"7","__proto__":{"pwned":true}}') as AnyRec;
    const r2 = port.resolveForward("src", polluted as never, undefined);
    const landed2 = r2.params as AnyRec;

    out["B5.P3"] = {
      inheritedAccessorVerdict: verdict,
      accessorHits: hits,
      landedAfterInheritedAccessor: landed,
      landedOwnId: Object.hasOwn(landed, "id"),
      protoOwnKeyOnResult: Object.hasOwn(landed2, "__proto__"),
      resultProtoIsObjectPrototype:
        Object.getPrototypeOf(landed2) === Object.prototype,
      globalPwned: String(({} as AnyRec)["pwned"]),
      resultLevelFrozen: Object.isFrozen(landed2),
      callerBagFrozenAfter: Object.isFrozen(polluted),
    };
  }

  // ================= C. port().buildPath =================

  // --- C0 ПОЗИТИВНЫЙ КОНТРОЛЬ + фасадный близнец.
  {
    const { router, ctx } = build();
    const port = ctx.port();

    out["C0.control"] = {
      portHref: port.buildPath("u", { id: "7" }, { tab: "x", extra: "e" }),
      facadeHref: router.buildPath(
        "u",
        { id: "7" } as never,
        { tab: "x", extra: "e" } as never,
      ),
    };
  }

  // --- C1 ЭКСПЕРИМЕНТ (а): копия контейнера против оригинала.
  {
    const { ctx } = build();
    const port = ctx.port();
    const params = { id: "7" } as AnyRec;
    const search = { tab: "x", extra: "e" } as AnyRec;
    const hrefOrig = port.buildPath("u", params as never, search as never);
    const hrefCopy = port.buildPath(
      "u",
      { ...params } as never,
      { ...search } as never,
    );

    params["id"] = "MUTATED";
    search["tab"] = "MUTATED";

    out["C1.copy-experiment"] = {
      hrefOrig,
      hrefCopy,
      identical: hrefOrig === hrefCopy,
      callerParamsFrozenAfter: Object.isFrozen(params),
      callerSearchFrozenAfter: Object.isFrozen(search),
      // ничего не удержано: следующая печать видит мутацию, потому что мешок
      // передан заново, а не потому что ядро держало ручку
      hrefAfterMutation: port.buildPath("u", params as never, search as never),
    };
  }

  // --- C2 P1: счёт чтений + дрейф.
  {
    const { ctx } = build();
    const port = ctx.port();
    const p = countingBag({ id: "7" });
    const s = countingBag({ tab: "x", extra: "e" });
    const href = port.buildPath("u", p.bag as never, s.bag as never);

    const dp = driftingBag({ id: "FIRST" }, { id: "SECOND" });
    const ds = driftingBag({ tab: "first" }, { tab: "second" });
    const driftHref = port.buildPath("u", dp.bag as never, ds.bag as never);

    out["C2.P1"] = {
      href,
      paramsReads: { ...p.reads },
      searchReads: { ...s.reads },
      driftHref,
      driftParamsReads: { ...dp.reads },
      driftSearchReads: { ...ds.reads },
    };
  }

  // --- C3 P2: лгущий Proxy на обоих каналах.
  {
    const { ctx } = build();
    const port = ctx.port();
    // `extra` НЕ объявлен маршрутом → печатается только через loose-обход
    // objectKeys; ложь в ownKeys обязана его убрать.
    const lyingSearchUndeclared = lyingBag({ tab: "x", extra: "e" }, "extra");
    // `tab` ОБЪЯВЛЕН маршрутом → читается по имени из route.declaredQueryParams
    const lyingSearchDeclared = lyingBag({ tab: "x", extra: "e" }, "tab");
    // `id` — имя СЛОТА маршрута
    const lyingParams = lyingBag({ id: "7" }, "id");

    out["C3.P2"] = {
      hiddenUndeclaredKey: port.buildPath(
        "u",
        { id: "7" },
        lyingSearchUndeclared,
      ),
      hiddenDeclaredKey: port.buildPath("u", { id: "7" }, lyingSearchDeclared),
      hiddenPathSlot: t(() =>
        port.buildPath("u", lyingParams, { tab: "x" }),
      ),
      control: port.buildPath("u", { id: "7" }, { tab: "x", extra: "e" }),
    };
  }

  // --- C4 P3: унаследованный аксессор под именем ключа + собственный __proto__.
  {
    const { ctx } = build();
    const port = ctx.port();
    const hits: string[] = [];
    let verdict: string;
    let href = "";

    Object.defineProperty(Object.prototype, "tab", {
      configurable: true,
      get(): unknown {
        hits.push("get");

        return "INHERITED";
      },
      set(): void {
        hits.push("set");
      },
    });

    try {
      verdict = t(() => {
        href = port.buildPath("u", { id: "7" }, { tab: "x" });
      });
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete (Object.prototype as AnyRec)["tab"];
    }

    const accessorHref = href;
    const polluted = JSON.parse(
      '{"tab":"x","__proto__":{"pwned":true}}',
    ) as AnyRec;
    let pollutedHref = "";
    const pollutedVerdict = t(() => {
      pollutedHref = port.buildPath("u", { id: "7" }, polluted as never);
    });
    // фасадный близнец на ТОМ ЖЕ входе: горло (normalizeChannel) роняет
    // UNSAFE_KEY (#1792), опубликованный порт — нет.
    const facade = build();
    const facadeHref = facade.router.buildPath(
      "u",
      { id: "7" } as never,
      JSON.parse('{"tab":"x","__proto__":{"pwned":true}}') as never,
    );

    out["C4.P3"] = {
      inheritedAccessorVerdict: verdict,
      accessorHits: hits,
      hrefUnderInheritedAccessor: accessorHref,
      pollutedVerdict,
      pollutedHref,
      facadeTwinHref: facadeHref,
      globalPwned: String(({} as AnyRec)["pwned"]),
      emptyObjProtoIntact: Object.getPrototypeOf({}) === Object.prototype,
    };
  }

  console.log(JSON.stringify(out, null, 1));
}

main();
