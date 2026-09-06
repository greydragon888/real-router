// Семейство «порт-и-матчер · печатающие двери ниже normalizeChannel».
// Строки D/E/F: RouterInternals.buildStateResolved·resolvedParams,
// RouterInternals.routeGetStore().matcher.buildPath·params|search и ·options.
// Плюс общий P4-контроль: уровень, который ядро ПУБЛИКУЕТ, заморожен.
import { createRouter } from "@real-router/core";
import { getInternals } from "@real-router/core/validation";

import {
  countingBag,
  countingProxy,
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

function lyingBag<T extends AnyRec>(source: T, hidden: string): T {
  return new Proxy(source, {
    ownKeys: (target) => Reflect.ownKeys(target).filter((k) => k !== hidden),
    getOwnPropertyDescriptor: (target, key) =>
      key === hidden
        ? {
            value: target[hidden],
            writable: true,
            enumerable: true,
            configurable: true,
          }
        : Reflect.getOwnPropertyDescriptor(target, key),
  }) as T;
}

function build() {
  const router = createRouter(
    [
      { name: "home", path: "/home" },
      { name: "u", path: "/u/:id?tab" },
    ] as never,
    { defaultRoute: "home" } as never,
    {} as never,
  );
  const ctx = getInternals(router);

  return {
    router,
    ctx,
    matcher: (
      ctx.routeGetStore() as unknown as {
        matcher: {
          buildPath: (
            n: string,
            p?: AnyRec,
            s?: AnyRec,
            o?: AnyRec,
          ) => string;
        };
      }
    ).matcher,
  };
}

async function main(): Promise<void> {
  // ========== D. RouterInternals.buildStateResolved·resolvedParams ==========

  // --- D0 ПОЗИТИВНЫЙ КОНТРОЛЬ обеих арок.
  {
    const { ctx } = build();
    const known = ctx.buildStateResolved("u", { id: "7" });

    out["D0.control"] = {
      knownRouteKeys: known === undefined ? undefined : Object.keys(known),
      knownName: (known as unknown as AnyRec | undefined)?.["name"],
      unknownRoute: String(ctx.buildStateResolved("nope", { id: "7" })),
    };
  }

  // --- D1 идентичность + D2 ЭКСПЕРИМЕНТ (а).
  {
    const { ctx, router } = build();

    await router.start("/home");
    const leaf = { svc: 1 };
    const orig = { id: "7", leaf } as AnyRec;
    const copy = { ...orig };
    const sOrig = ctx.buildStateResolved("u", orig as never) as unknown as
      | AnyRec
      | undefined;
    const sCopy = ctx.buildStateResolved("u", copy as never) as unknown as
      | AnyRec
      | undefined;
    const stateBefore = JSON.stringify(router.getState());

    // ОБРАТНАЯ ВИДИМОСТЬ: мутируем оригинал ПОСЛЕ вызова.
    orig["id"] = "MUTATED";

    out["D1.identity-and-copy"] = {
      paramsIsCallersObject: sOrig?.["params"] === (orig as unknown),
      copyParamsIsCopy: sCopy?.["params"] === (copy as unknown),
      leafIdentityKept: (sCopy?.["params"] as AnyRec)["leaf"] === leaf,
      sameNameAndMeta:
        sOrig?.["name"] === sCopy?.["name"] &&
        sOrig?.["meta"] === sCopy?.["meta"],
      searchPlaceholderFreshPerCall:
        sOrig?.["search"] !== sCopy?.["search"],
      shellFrozen: Object.isFrozen(sOrig),
      callerBagFrozenAfter: Object.isFrozen(orig),
      // ничего не сели в состояние ядра
      stateUnchanged: stateBefore === JSON.stringify(router.getState()),
      hrefUnchanged: router.buildPath("u", { id: "1" } as never),
      // мутация оригинала видна ТОЛЬКО потому, что ядро вернуло тот же объект
      shellParamsAfterMutation: sOrig?.["params"],
    };
  }

  // --- D3 P1/P2/P3: считаем чтения ядра на мешке вызывающего.
  {
    const { ctx } = build();
    const counted = countingBag({ id: "7", extra: "e" });
    const shell = ctx.buildStateResolved(
      "u",
      counted.bag as never,
    ) as unknown as AnyRec | undefined;
    const coreReads = { ...counted.reads };

    const lying = lyingBag({ id: "7", extra: "e" }, "extra");
    const lyingShell = ctx.buildStateResolved("u", lying as never) as unknown as
      | AnyRec
      | undefined;

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

    let accessorVerdict: string;

    try {
      accessorVerdict = t(() => ctx.buildStateResolved("u", {} as never));
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete (Object.prototype as AnyRec)["id"];
    }

    out["D3.P1-P3"] = {
      coreReads,
      shellDefined: shell !== undefined,
      lyingShellParamsIsProxy: lyingShell?.["params"] === (lying as unknown),
      accessorVerdict,
      accessorHits: hits,
    };
  }

  // ========== E/F. routeGetStore().matcher.buildPath ==========

  // --- E0 ПОЗИТИВНЫЙ КОНТРОЛЬ: движковая печать = фасадная.
  {
    const { router, matcher } = build();

    out["E0.control"] = {
      matcherHref: matcher.buildPath("u", { id: "7" }, { tab: "x", extra: "e" }),
      facadeHref: router.buildPath(
        "u",
        { id: "7" } as never,
        { tab: "x", extra: "e" } as never,
      ),
      unknownRoute: t(() => matcher.buildPath("nope", { id: "7" })),
    };
  }

  // --- E1 ЭКСПЕРИМЕНТ (а) на трёх контейнерах: params, search, options.
  {
    const { matcher } = build();
    const params = { id: "7" } as AnyRec;
    const search = { tab: "x", extra: "e" } as AnyRec;
    const options = {
      trailingSlash: "preserve",
      queryParamsMode: "loose",
    } as AnyRec;
    const hrefOrig = matcher.buildPath("u", params, search, options);
    const hrefCopy = matcher.buildPath(
      "u",
      { ...params },
      { ...search },
      { ...options },
    );

    params["id"] = "MUTATED";
    search["tab"] = "MUTATED";
    options["queryParamsMode"] = "strict";

    out["E1.copy-experiment"] = {
      hrefOrig,
      hrefCopy,
      identical: hrefOrig === hrefCopy,
      paramsFrozenAfter: Object.isFrozen(params),
      searchFrozenAfter: Object.isFrozen(search),
      optionsFrozenAfter: Object.isFrozen(options),
      // ядро ручку не удержало: следующая печать берёт мешок заново
      hrefAfterMutation: matcher.buildPath("u", params, search, options),
    };
  }

  // --- E2 P1 на трёх контейнерах: счёт + дрейф.
  {
    const { matcher } = build();
    const p = countingBag({ id: "7" });
    const s = countingBag({ tab: "x", extra: "e" });
    const o = countingProxy({
      trailingSlash: "preserve",
      queryParamsMode: "loose",
    });
    const href = matcher.buildPath("u", p.bag, s.bag, o.bag);

    const dp = driftingBag({ id: "FIRST" }, { id: "SECOND" });
    const ds = driftingBag({ tab: "first" }, { tab: "second" });
    // ЛГУЩИЙ options: первое чтение queryParamsMode отвечает "strict", второе "loose"
    const doo = countingProxy(
      { trailingSlash: "preserve", queryParamsMode: "loose" },
      (key, nth) =>
        key === "queryParamsMode"
          ? nth === 1
            ? "strict"
            : "loose"
          : "preserve",
    );
    const driftHref = matcher.buildPath("u", dp.bag, ds.bag, doo.bag);

    out["E2.P1"] = {
      href,
      paramsReads: { ...p.reads },
      searchReads: { ...s.reads },
      optionsReads: { ...o.reads },
      driftHref,
      driftParamsReads: { ...dp.reads },
      driftSearchReads: { ...ds.reads },
      driftOptionsReads: { ...doo.reads },
    };
  }

  // --- E3 P2: лгущий Proxy на трёх контейнерах.
  {
    const { matcher } = build();

    out["E3.P2"] = {
      hiddenUndeclaredSearchKey: matcher.buildPath(
        "u",
        { id: "7" },
        lyingBag({ tab: "x", extra: "e" }, "extra"),
        { queryParamsMode: "loose" },
      ),
      hiddenDeclaredSearchKey: matcher.buildPath(
        "u",
        { id: "7" },
        lyingBag({ tab: "x", extra: "e" }, "tab"),
        { queryParamsMode: "loose" },
      ),
      hiddenOptionsKey: matcher.buildPath(
        "u",
        { id: "7" },
        { tab: "x", extra: "e" },
        lyingBag({ queryParamsMode: "loose" }, "queryParamsMode"),
      ),
      control: matcher.buildPath("u", { id: "7" }, { tab: "x", extra: "e" }, {
        queryParamsMode: "loose",
      }),
    };
  }

  // --- E4 P3: унаследованный аксессор + собственный __proto__.
  {
    const { matcher } = build();
    const hits: string[] = [];
    let accessorHref = "";

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

    let accessorVerdict: string;

    try {
      accessorVerdict = t(() => {
        accessorHref = matcher.buildPath("u", { id: "7" }, { tab: "x" }, {
          queryParamsMode: "loose",
        });
      });
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete (Object.prototype as AnyRec)["tab"];
    }

    let pollutedHref = "";
    const pollutedVerdict = t(() => {
      pollutedHref = matcher.buildPath(
        "u",
        { id: "7" },
        JSON.parse('{"tab":"x","__proto__":{"pwned":true}}') as AnyRec,
        { queryParamsMode: "loose" },
      );
    });

    out["E4.P3"] = {
      accessorVerdict,
      accessorHits: hits,
      accessorHref,
      pollutedVerdict,
      pollutedHref,
      globalPwned: String(({} as AnyRec)["pwned"]),
      emptyObjProtoIntact: Object.getPrototypeOf({}) === Object.prototype,
    };
  }

  // --- P4-КОНТРОЛЬ семейства: уровень, который ядро ПУБЛИКУЕТ, заморожен.
  {
    const { router } = build();

    await router.start("/home");
    const state = await router.navigate("u", { id: "7" } as never, {} as never);

    out["P4.publication-control"] = {
      stateShellFrozen: Object.isFrozen(state),
      stateParamsFrozen: Object.isFrozen(state.params),
      stateSearchFrozen: Object.isFrozen(state.search),
    };
  }

  console.log(JSON.stringify(out, null, 1));
}

void main();
