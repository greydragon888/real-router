// МАТРИЦА семейства «закоммиченный state.context · ОДИН объект × 17 путей».
//
// Семейство — исключение из правила «одна дверь × N путей»: все 17 строк
// переписи ведут к ОДНОМУ контейнеру — `RouterFSMContext.current.context`,
// который породило ядро (`materialize.ts · buildState: context: {}`) и которое
// пере-порождает на каждом коммите (`EventBusNamespace.ts · systemCommit:
// context: { ...toState.context }`, `NavigationNamespace.ts · #copyChannels`).
// Поэтому эксперимент (а) и P1–P4 ставятся ОДИН раз на объект, а по каждому
// пути проверяется только идентичность/обратная видимость (это сделано пробами
// первой волны: triage-committed-context-roundtrip/roundtrip-read-back.ts,
// roundtrip-remaining-eight.ts, triage-context-handout-batch/read-back-per-door.ts).
//
// Колонки этой матрицы:
//   A  — ОДИН объект: все пути, наблюдающие один и тот же закоммиченный State,
//        отдают ОДИН И ТОТ ЖЕ контейнер (Set из захваченных ссылок = 1).
//   B  — эксперимент (а): единственное место, где КОНТЕЙНЕР ПРИЛОЖЕНИЯ входит в
//        родословную этого объекта, — чужой State в `systemCommit` /
//        `navigateToState`. Арма ORIG (оригинальный контейнер) против армы COPY
//        (предварительно скопированный) — сравниваются ВСЕ наблюдаемые
//        следствия. Плюс обратная видимость в обе стороны.
//   B2 — что было бы, если применить (а) к ХЭНДАУТУ (отдавать приложению копию):
//        показываем цену — `claim.write(state, …)` перестаёт доходить. Это НЕ
//        делает дверь MUST-(б) (семя 1: «мутабельна по контракту» ≠ «обязана
//        сохранить идентичность»); (а) требует копировать контейнер ВЫЗЫВАЮЩЕГО,
//        а тут контейнер — собственный объект ядра, и он уже копируется.
//   P1 — ДРЕЙФУЮЩИЙ аксессор на закоммиченном контейнере: сколько раз копирующий
//        примитив читает ключ и от какого чтения берётся результат.
//   P2 — ЛГУЩИЙ Proxy: (i) можно ли подменить сам контейнер (оболочка заморожена);
//        (ii) тот же копирующий символ с Proxy в роли чужого контейнера.
//   P3 — унаследованный сеттер под именем ключа + собственный «__proto__».
//   P4 — какой уровень заморожен.
//
// Позитивные контроли — в каждой секции, помечены ключом `control*`.
import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";
import { driftingBag } from "../../../../packages/core/tests/helpers/hostileBags";

type Ctx = Record<string, unknown>;
type St = { name: string; path: string; params: Ctx; search: Ctx; context: Ctx };

type R = ReturnType<typeof createRouter>;
const st = (r: R): St => r.getState() as unknown as St;

const ROUTES = [
  { name: "h", path: "/h" },
  { name: "a", path: "/a" },
  { name: "d", path: "/d" },
];

const out: Record<string, unknown> = {};

/* ───────────────────────── A. ОДИН объект × N путей ───────────────────────── */
async function sectionA(): Promise<void> {
  let releaseSlow: () => void = () => undefined;
  const parked = new Promise<void>((res) => {
    releaseSlow = res;
  });

  const captured = new Map<string, Ctx>();
  const sameAsCurrent: Record<string, boolean> = {};
  let router!: R;
  let capturing = true;

  const cap = (label: string, state: unknown): void => {
    if (!capturing || state === null || state === undefined) {
      return;
    }
    const ctx = (state as St).context;
    if (ctx === undefined) {
      return;
    }
    // Только пути, наблюдающие ТЕКУЩЕЕ закоммиченное состояние: сравнение
    // «один объект» осмысленно внутри одной жизни коммита.
    const cur = (router.getState() as unknown as St | undefined)?.context;
    if (ctx !== cur) {
      sameAsCurrent[label] = false;
      return;
    }
    sameAsCurrent[label] = true;
    captured.set(label, ctx);
  };

  const routes = [
    ...ROUTES,
    {
      name: "aa",
      path: "/aa",
      canDeactivate:
        () =>
        (_to: unknown, from: unknown): boolean => {
          cap("GuardFn·fromState.context", from);
          return true;
        },
    },
    { name: "refused", path: "/refused", canActivate: () => (): boolean => false },
    {
      name: "slow",
      path: "/slow",
      canActivate: () => async (): Promise<boolean> => {
        await parked;
        return true;
      },
    },
  ];

  router = createRouter(routes as never, { defaultRoute: "d" } as never);
  const api = getPluginApi(router);

  router.usePlugin(() => ({
    onTransitionStart: (_to: unknown, from: unknown) => {
      cap("Plugin.onTransitionStart·fromState.context", from);
    },
    onTransitionLeaveApprove: (_to: unknown, from: unknown) => {
      cap("Plugin.onTransitionLeaveApprove·fromState.context", from);
    },
    onTransitionSuccess: (to: unknown) => {
      cap("Plugin.onTransitionSuccess·toState.context", to);
    },
    onTransitionCancel: (_to: unknown, from: unknown) => {
      cap("Plugin.onTransitionCancel·fromState.context", from);
    },
    onTransitionError: (_to: unknown, from: unknown) => {
      cap("Plugin.onTransitionError·fromState.context", from);
    },
  }));
  for (const evt of ["$$start", "$$leaveApprove", "$$cancel", "$$error"]) {
    api.addEventListener(evt as never, ((_to: unknown, from: unknown) => {
      cap(`PluginApi.addEventListener·cb·fromState.context@${evt}`, from);
    }) as never);
  }
  router.subscribe((p: { route: unknown }) => {
    cap("Router.subscribe·SubscribeFn·state.route.context", p.route);
  });
  router.subscribeLeave((p: { route: unknown }) => {
    cap("Router.subscribeLeave·LeaveFn·leaveState.route.context", p.route);
  });

  await router.start("/h");
  const navRet = (await router.navigate("aa")) as unknown as St;
  cap("Router.navigate·return.context", navRet);
  cap("Router.getState·return.context", router.getState());

  // 'aa' остаётся текущим: отменённая (slow) и провалившаяся (refused) навигации
  // коммита не делают, поэтому все fromState-пути видят ТОТ ЖЕ контейнер.
  const slow = router.navigate("slow").catch(() => undefined);
  const refused = router.navigate("refused").catch(() => undefined);
  releaseSlow();
  await Promise.all([slow, refused]);
  capturing = false;

  const set = new Set(captured.values());
  out.A_oneObject = {
    "paths captured while 'aa' was the committed state": [...captured.keys()],
    "distinct containers among them (must be 1)": set.size,
    "all === getState().context": [...set][0] === st(router).context,
    "state name still 'aa' (no commit happened in between)":
      st(router).name === "aa",
    perPath_sameAsCurrentAtHandout: sameAsCurrent,
    // Контроль дискриминации инструмента: контейнер ПРЕДЫДУЩЕГО состояния — не
    // тот же объект, значит Set-проверка не тавтологична.
    control_previousIsDifferentObject:
      (router.getPreviousState() as unknown as St | undefined)?.context !==
      st(router).context,
  };
  router.dispose();
}

/* ────────── B. Эксперимент (а): чужой контейнер оригинал vs копия ────────── */
async function foreignArm(
  tag: string,
  preCopy: boolean,
): Promise<Record<string, unknown>> {
  const r = createRouter(ROUTES as never, { defaultRoute: "d" } as never);
  await r.start("/h");
  const leaf = { svc: `service-${tag}` }; // ЛИСТ — обязан остаться по ссылке
  const original: Ctx = { ns: leaf, plain: 1 };
  const handed: Ctx = preCopy ? { ...original } : original;

  const seen: string[] = [];
  r.subscribe((p: { route: unknown }) => {
    seen.push((p.route as St).name);
  });

  const foreign = {
    name: "a",
    params: {},
    search: {},
    path: "/a",
    context: handed,
  };
  const ret = getInternals(r).systemCommit(
    foreign as never,
    r.getState() as never,
    {} as never,
  ) as unknown as St;

  const committed = st(r);
  // Обратная видимость: мутируем ОРИГИНАЛ после вызова — видит ли ядро?
  original.addedAfter = "late";
  const coreSeesLateWrite = "addedAfter" in committed.context;
  // Обратная видимость: мутируем то, что ядро отдало — видит ли оригинал?
  committed.context.addedByApp = "back";
  const originalSeesCoreWrite = "addedByApp" in original;

  return {
    tag,
    "return === getState()": (ret as unknown) === (committed as unknown),
    "committed.context !== the container passed in": committed.context !== handed,
    "committed state (name/path)": `${committed.name}|${committed.path}`,
    "buildPath('a')": r.buildPath("a", {}),
    "Object.keys(committed.context)": Object.keys(committed.context).sort(),
    "LEAF identity preserved (committed.context.ns === leaf)":
      committed.context.ns === leaf,
    "committed.context.plain": committed.context.plain,
    "subscribe saw": seen,
    "core sees a LATE write into the original container": coreSeesLateWrite,
    "original sees a write into what core handed out": originalSeesCoreWrite,
    "original container frozen after passing through": Object.isFrozen(original),
    "leaf frozen after passing through": Object.isFrozen(leaf),
  };
}

async function sectionB(): Promise<void> {
  const orig = await foreignArm("ORIG", false);
  const copy = await foreignArm("COPY", true);
  const cmp = (k: string): unknown => [orig[k], copy[k]];
  out.B_experimentA = {
    ORIG: orig,
    COPY: copy,
    "ORIG vs COPY — observable differences": Object.keys(orig)
      .filter((k) => k !== "tag")
      .filter((k) => JSON.stringify(orig[k]) !== JSON.stringify(copy[k]))
      .map((k) => ({ key: k, orig: (cmp(k) as unknown[])[0], copy: (cmp(k) as unknown[])[1] })),
  };
}

/* ── B2. Что ломает (а), применённая к ХЭНДАУТУ (копия наружу) — цена, не вердикт ── */
async function sectionB2(): Promise<void> {
  const r = createRouter(ROUTES as never, {} as never);
  const api = getPluginApi(r);
  const claim = api.claimContextNamespace("probe");
  await r.start("/h");

  // Реальный путь плагина: claim.write(getState(), value) — пишет в КОНТЕЙНЕР ЯДРА.
  claim.write(r.getState() as never, { real: 1 });
  const reachedReal = JSON.stringify(st(r).context.probe);

  // Эмуляция (а) НА ХЭНДАУТЕ: плагину отдали бы копию State с копией context.
  const handoutCopy = { ...st(r), context: { ...st(r).context } } as unknown as St;
  claim.write(handoutCopy as never, { viaCopy: 1 });
  out.B2_copyAtHandout = {
    "claim.write through the real handout reaches core state": reachedReal,
    "claim.write through a COPIED handout reaches core state":
      JSON.stringify(st(r).context.probe),
    "…it landed in the copy instead":
      JSON.stringify((handoutCopy.context as Ctx).probe),
    note: "Цена (а) НА ХЭНДАУТЕ, не вердикт: (а) требует копировать контейнер ВЫЗЫВАЮЩЕГО; здесь контейнер — собственный объект ядра, и он копируется на входе (секция B).",
  };
  r.dispose();
}

/* ───────────────── P1. Дрейфующий аксессор на закоммиченном ctx ───────────────── */
async function sectionP1(): Promise<void> {
  // Контроль инструмента: дрейф действительно дрейфует.
  let ctl = 0;
  const ctlBag: Ctx = {};
  Object.defineProperty(ctlBag, "k", {
    enumerable: true,
    configurable: true,
    get: () => `read#${++ctl}`,
  });
  const controlFirst = ctlBag.k;
  const controlSecond = ctlBag.k;

  const r = createRouter(ROUTES as never, {} as never);
  await r.start("/h");
  const ctx = st(r).context;
  const reads: Record<string, number> = { alpha: 0, beta: 0 };
  for (const key of ["alpha", "beta"]) {
    Object.defineProperty(ctx, key, {
      enumerable: true,
      configurable: true,
      get: () => `${key}#${++reads[key]}`,
    });
  }
  // Read-back-сайт: getRoutesApi · replace → commitRevalidated → systemCommit.
  await getRoutesApi(r).replace(ROUTES as never);
  const after = st(r).context;
  out.P1 = {
    control_driftingAccessorDrifts: [controlFirst, controlSecond],
    "reads per key during the read-back copy": { ...reads },
    "committed values (must be the FIRST read)": {
      alpha: after.alpha,
      beta: after.beta,
    },
    "new container after replace": after !== ctx,
    "committed values are plain data, not accessors": [
      Object.getOwnPropertyDescriptor(after, "alpha")?.get === undefined,
      Object.getOwnPropertyDescriptor(after, "beta")?.get === undefined,
    ],
  };
  r.dispose();
}

/* ── P1b. Тот же копирующий символ на ВХОДЕ: дрейфующий контейнер чужого State ── */
// Контейнер, который читают ОБРАТНО (P1), — всегда собственный объект ядра, и
// приложение может поставить на него аксессор (P1 выше). Здесь тот же символ
// `{ ...toState.context }` читает контейнер ПРИЛОЖЕНИЯ (соседняя дверь входа) —
// проверяем счёт [[Get]] на ключ и что берётся ПЕРВОЕ чтение.
async function sectionP1b(): Promise<void> {
  const r = createRouter(ROUTES as never, {} as never);
  await r.start("/h");
  const { bag, reads } = driftingBag(
    { one: "first-1", two: "first-2" },
    { one: "SECOND-1", two: "SECOND-2" },
  );
  const committed = getInternals(r).systemCommit(
    { name: "a", params: {}, search: {}, path: "/a", context: bag } as never,
    r.getState() as never,
    {} as never,
  ) as unknown as St;
  const readsAfterCopy = { ...reads };
  const controlDrift = [
    (bag as Record<string, unknown>).one,
    (bag as Record<string, unknown>).one,
  ];
  out.P1b = {
    "reads per key during the ENTRY copy": readsAfterCopy,
    "control_drifting bag drifts (reads taken AFTER the snapshot)": controlDrift,
    "committed values": {
      one: committed.context.one,
      two: committed.context.two,
    },
    "committed.context !== the caller bag": committed.context !== (bag as unknown),
  };
  r.dispose();
}

/* ───────────────── P2. Лгущий Proxy ───────────────── */
async function sectionP2(): Promise<void> {
  // (i) Может ли приложение подменить сам контейнер на Proxy?
  const r = createRouter(ROUTES as never, {} as never);
  await r.start("/h");
  const shell = st(r) as unknown as Record<string, unknown>;
  const before = shell.context;
  let threw: string | undefined;
  try {
    shell.context = new Proxy({}, {});
  } catch (error) {
    threw = (error as Error).constructor.name;
  }
  const swapResult = {
    "State shell frozen": Object.isFrozen(shell),
    "assignment threw": threw ?? "no",
    "context replaced": shell.context !== before,
  };
  r.dispose();

  // (ii) Тот же копирующий символ, но контейнер — ЛГУЩИЙ Proxy (достижимо
  // через соседнюю дверь входа: чужой State в systemCommit).
  const target: Ctx = { visible: "yes" };
  let ownKeysCalls = 0;
  let gopdCalls = 0;
  const liar = new Proxy(target, {
    ownKeys(t) {
      ownKeysCalls++;
      return Reflect.ownKeys(t); // "hidden" НЕ назван
    },
    getOwnPropertyDescriptor(t, k) {
      gopdCalls++;
      if (k === "hidden") {
        return { value: "smuggled", enumerable: true, configurable: true, writable: true };
      }
      return Reflect.getOwnPropertyDescriptor(t, k);
    },
    get(t, k, rec) {
      if (k === "hidden") {
        return "smuggled";
      }
      return Reflect.get(t, k, rec);
    },
    has(t, k) {
      return k === "hidden" || Reflect.has(t, k);
    },
  });

  const r2 = createRouter(ROUTES as never, {} as never);
  await r2.start("/h");
  const committed = getInternals(r2).systemCommit(
    { name: "a", params: {}, search: {}, path: "/a", context: liar } as never,
    r2.getState() as never,
    {} as never,
  ) as unknown as St;

  out.P2 = {
    swapContainerForAProxy: swapResult,
    control_liarLies: {
      "'hidden' in liar": "hidden" in liar,
      "Object.getOwnPropertyDescriptor(liar,'hidden') exists":
        Object.getOwnPropertyDescriptor(liar, "hidden") !== undefined,
      "Object.keys(liar)": Object.keys(liar),
    },
    "committed keys": Object.keys(committed.context).sort(),
    "'hidden' smuggled into committed context": "hidden" in committed.context,
    "positive control — the honest key landed": committed.context.visible,
    trapCalls: { ownKeysCalls, gopdCalls },
  };
  r2.dispose();
}

/* ───────────────── P3. Унаследованный сеттер + собственный __proto__ ───────────────── */
async function sectionP3(): Promise<void> {
  const NAME = "p3ns";
  let setterHits = 0;
  let controlHit = 0;
  const res: Record<string, unknown> = {};

  Object.defineProperty(Object.prototype, NAME, {
    configurable: true,
    get(): unknown {
      return undefined;
    },
    set(): void {
      setterHits++;
    },
  });
  try {
    // Контроль: ловушка ВЗВЕДЕНА — обычный [[Set]] её вызывает.
    const plain: Record<string, unknown> = {};
    plain[NAME] = 1;
    controlHit = setterHits;

    const r = createRouter(ROUTES as never, {} as never);
    await r.start("/h");
    const ctx = st(r).context;
    // Приложение кладёт СВОЙ ключ через define (как это делает putField), чтобы
    // ключ существовал как собственный и прошёл копию.
    Object.defineProperty(ctx, NAME, {
      value: "own-value",
      enumerable: true,
      configurable: true,
      writable: true,
    });
    // И собственный "__proto__" — контракт `context` (#1191 / #1788).
    Object.defineProperty(ctx, "__proto__", {
      value: { poison: true },
      enumerable: true,
      configurable: true,
      writable: true,
    });
    const hitsBefore = setterHits;
    let replaceThrew: string | undefined;
    try {
      await getRoutesApi(r).replace(ROUTES as never);
    } catch (error) {
      replaceThrew = (error as Error).message;
    }
    const after = st(r).context;
    res.controlSetterArmed = controlHit === 1;
    res["setter hits during the copy (must be 0)"] = setterHits - hitsBefore;
    res["replace threw"] = replaceThrew ?? "no";
    res["own value survived the copy"] = after[NAME];
    res["it is an own DATA property on the new container"] =
      Object.getOwnPropertyDescriptor(after, NAME)?.value === "own-value";
    res["own '__proto__' survived as own data"] =
      Object.getOwnPropertyDescriptor(after, "__proto__")?.value !== undefined;
    res["prototype of the new container is Object.prototype"] =
      Object.getPrototypeOf(after) === Object.prototype;
    res["committed container is not poisoned"] =
      (after as { poison?: unknown }).poison === undefined;
    r.dispose();
  } finally {
    delete (Object.prototype as Record<string, unknown>)[NAME];
  }
  out.P3 = res;
}

/* ───────────────── P4. Уровни заморозки ───────────────── */
async function sectionP4(): Promise<void> {
  const r = createRouter(ROUTES as never, {} as never);
  const api = getPluginApi(r);
  const claim = api.claimContextNamespace("p4");
  const appBag = { nested: { deep: 1 } };
  r.usePlugin(() => ({
    onTransitionSuccess: (to: unknown) => {
      claim.write(to as never, appBag);
    },
  }));
  await r.start("/h");
  const s = st(r);
  out.P4 = {
    "shell (State) frozen — core's own level": Object.isFrozen(s),
    "params frozen (core's level)": Object.isFrozen(s.params),
    "context container frozen": Object.isFrozen(s.context),
    "context container is core's object (fresh per commit)":
      s.context !== undefined,
    "app bag written into context frozen": Object.isFrozen(
      s.context.p4 as object,
    ),
    "nested app object frozen": Object.isFrozen(
      (s.context.p4 as { nested: object }).nested,
    ),
    "app bag reached core state by reference": s.context.p4 === appBag,
    control_freezeWorks: Object.isFrozen(Object.freeze({})),
  };
  r.dispose();
}

async function main(): Promise<void> {
  await sectionA();
  await sectionB();
  await sectionB2();
  await sectionP1();
  await sectionP1b();
  await sectionP2();
  await sectionP3();
  await sectionP4();
  console.log(JSON.stringify(out, null, 2));
}

void main();
