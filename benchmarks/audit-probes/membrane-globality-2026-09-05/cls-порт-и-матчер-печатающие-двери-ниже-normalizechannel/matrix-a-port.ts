// Семейство «порт-и-матчер · печатающие двери ниже normalizeChannel».
// Строка A: RouterInternals.port·return (kind=roundtrip, объект ЯДРА, отданный наружу).
//
// Столбцы: эксперимент (а) [= отдать копию/заморозить у источника] · P1 · P2 · P3 · P4.
// Позитивный контроль в каждой ячейке — тот же навигационный вызов на нетронутом
// роутере; доказательство достижения ветки — контроль печатает d-default, а атака
// печатает HACKED (значит ядро читает отданный объект ОБРАТНО).
import { createRouter } from "@real-router/core";
import { getInternals } from "@real-router/core/validation";

type AnyRec = Record<string, unknown>;

// Фальшивый валидатор: рекурсивный no-op прокси — нужен ТОЛЬКО чтобы
// `ctx.validator` стал truthy и два геттера порта перестали отвечать undefined.
const noopValidator: unknown = new Proxy(function () {} as unknown as object, {
  get: (): unknown => noopValidator,
  apply: (): unknown => undefined,
});

const out: AnyRec = {};
const t = async (fn: () => unknown): Promise<string> => {
  try {
    await fn();

    return "no-throw";
  } catch (error) {
    return `throw:${(error as Error).constructor.name}:${(error as Error).message.slice(0, 60)}`;
  }
};

function build() {
  const router = createRouter(
    [
      { name: "home", path: "/home" },
      { name: "u", path: "/u/:id?tab" },
      { name: "d", path: "/d/:id?page", defaultParams: { id: "d-default" } },
      { name: "src", path: "/src/:id", forwardTo: "dst" },
      { name: "dst", path: "/dst/:id?q" },
    ] as never,
    { defaultRoute: "home" } as never,
    {} as never,
  );

  return { router, ctx: getInternals(router) };
}

async function main(): Promise<void> {
  // --- A1 ПОЗИТИВНЫЙ КОНТРОЛЬ: нетронутый роутер, defaultParams доезжает.
  {
    const { router } = build();

    await router.start("/home");
    out["A1.control"] = {
      navigate_d: (await router.navigate("d", {} as never)).params,
    };
  }

  // --- A2 форма хэндаута.
  {
    const { ctx } = build();
    const p1 = ctx.port();
    const p2 = ctx.port();

    out["A2.shape"] = {
      sameObjectAcrossCalls: p1 === p2,
      frozen: Object.isFrozen(p1),
      proto:
        Object.getPrototypeOf(p1) === Object.prototype
          ? "Object.prototype"
          : "other",
      ownKeys: Object.keys(p1),
      accessorMembers: Object.entries(
        Object.getOwnPropertyDescriptors(p1),
      ).flatMap(([k, d]) => (d.get ? [k] : [])),
    };
  }

  // --- A3 ROUND-TRIP: ядро читает отданный объект обратно (атака работает).
  {
    const { router, ctx } = build();

    await router.start("/home");
    const port = ctx.port();
    const wrote = await t(() => {
      (port as unknown as AnyRec)["defaultParams"] = () => ({ id: "HACKED" });
    });
    const after = await router.navigate("d", {} as never);

    out["A3.roundtrip"] = {
      memberOverwriteVerdict: wrote,
      navigateParamsAfterOverwrite: after.params,
      coreReadsBack: (after.params as AnyRec)["id"] === "HACKED",
    };
  }

  // --- A4 ЭКСПЕРИМЕНТ (а), форма «заморозить уровень у источника».
  // Заморозка ставится СНАРУЖИ (src не правится) на тот самый объект ядра.
  {
    const { router, ctx } = build();

    await router.start("/home");
    const port = ctx.port();

    Object.freeze(port);
    const wrote = await t(() => {
      (port as unknown as AnyRec)["defaultParams"] = () => ({ id: "HACKED" });
    });
    const after = await router.navigate("d", {} as never);

    // печать после заморозки — ДО установки фальшивого валидатора.
    const href = router.buildPath(
      "u",
      { id: "7" } as never,
      { tab: "x" } as never,
    );

    // геттеры порта переживают заморозку: ставим фальшивый валидатор ПОСЛЕ
    // заморозки и спрашиваем оба опциональных стока.
    const sinkBefore = typeof port.reportDroppedQueryKey;

    (ctx as unknown as AnyRec)["validator"] = noopValidator;
    const sinkAfter = typeof port.reportDroppedQueryKey;

    out["A4.frozen-at-source"] = {
      memberOverwriteVerdict: wrote,
      navigateParamsAfterOverwrite: after.params,
      steeringDefeated: (after.params as AnyRec)["id"] === "d-default",
      // навигация после заморозки по-прежнему печатает и мержит
      href,
      lazyGetterSurvivesFreeze: { sinkBefore, sinkAfter },
    };
  }

  // --- A5 ЭКСПЕРИМЕНТ (а), форма «отдать КОПИЮ контейнера».
  // Копия делается дескрипторами (два геттера сохраняют ленивость), и по КАЖДОМУ
  // члену сравнивается наблюдаемый результат с оригиналом.
  {
    const { router, ctx } = build();

    await router.start("/home");
    const port = ctx.port();
    const copy = Object.create(
      Object.getPrototypeOf(port) as object,
      Object.getOwnPropertyDescriptors(port),
    ) as typeof port;

    const memberEquivalence = {
      buildPath: [
        port.buildPath("u", { id: "7" }, { tab: "x" }),
        copy.buildPath("u", { id: "7" }, { tab: "x" }),
      ],
      queryNames: [port.queryNames("u"), copy.queryNames("u")],
      pathNames: [port.pathNames("u"), copy.pathNames("u")],
      pathNamesUnknown: [port.pathNames("nope"), copy.pathNames("nope")],
      defaultParams: [port.defaultParams("d"), copy.defaultParams("d")],
      defaultSearch: [port.defaultSearch("d"), copy.defaultSearch("d")],
      admitsUndeclaredQuery: [
        port.admitsUndeclaredQuery(),
        copy.admitsUndeclaredQuery(),
      ],
      resolveForward: [
        port.resolveForward("src", { id: "7" }),
        copy.resolveForward("src", { id: "7" }),
      ],
      sinkWhileBare: [
        typeof port.reportDroppedQueryKey,
        typeof copy.reportDroppedQueryKey,
      ],
    };

    // ленивость геттера в КОПИИ: валидатор ставится после копирования.
    (ctx as unknown as AnyRec)["validator"] = noopValidator;
    const sinkAfterValidator = [
      typeof port.reportDroppedQueryKey,
      typeof copy.reportDroppedQueryKey,
    ];

    out["A5.copy-equivalence"] = {
      memberEquivalence: JSON.parse(
        JSON.stringify(memberEquivalence),
      ) as unknown,
      sinkAfterValidator,
      // ОБРАТНАЯ ВИДИМОСТЬ: правка КОПИИ не доезжает до ядра
      copyOverwriteReachesCore: await (async () => {
        (copy as unknown as AnyRec)["defaultParams"] = () => ({ id: "HACKED" });

        return (await router.navigate("d", {} as never)).params;
      })(),
    };
  }

  console.log(JSON.stringify(out, null, 1));
}

void main();
