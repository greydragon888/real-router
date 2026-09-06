// Матрица классификации семейства «internals-слоты · сервисные объекты плагина».
// Строки: RouterInternals.validator, RouterInternals.interceptors.
// Столбцы: эксперимент (а) [копия контейнера на границе], P1, P2, P3, P4.
//
// Формы API прочитаны из исходника:
//   internals.ts · RouterInternals.validator (mutable RouterValidator | null)
//   internals.ts · createInterceptable / createTernaryInterceptable / executeInterceptorChain
//   api/getPluginApi.ts · addInterceptor  (`list = ctx.interceptors.get(m)` → `list.push(fn)`)
//   Router.ts · isActiveRoute (routes ×2, navigation ×1) / buildPath (routes ×1, navigation ×2)
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

const out: Record<string, unknown> = {};
const ROUTES = [{ name: "u", path: "/u/:id" }] as never;

/* ─────────────── инструмент: считающий/дрейфующий валидатор ─────────────── */

const SECTIONS = [
  "routes",
  "options",
  "dependencies",
  "plugins",
  "lifecycle",
  "navigation",
  "state",
  "eventBus",
] as const;

function makeSection(tag: string, calls: string[]): object {
  return new Proxy(
    {},
    {
      get(_t, m) {
        if (typeof m !== "string") return undefined;
        return (..._a: unknown[]) => {
          calls.push(`${tag}.${m}`);
        };
      },
    },
  );
}

/** Плоский валидатор с СОБСТВЕННЫМИ ключами-секциями (spread его копирует). */
function plainValidator(tag: string, calls: string[]): Record<string, object> {
  const v: Record<string, object> = {};
  for (const s of SECTIONS) v[s] = makeSection(`${tag}.${s}`, calls);
  return v;
}

/** Счётчик чтений верхних ключей поверх плоского валидатора. */
function countingValidator(tag: string, calls: string[]) {
  const target = plainValidator(tag, calls);
  const reads: Record<string, number> = {};
  const container = new Proxy(target, {
    get(t, k, r) {
      if (typeof k === "string") reads[k] = (reads[k] ?? 0) + 1;
      return Reflect.get(t, k, r);
    },
  });
  return { target, container, reads, calls };
}

function newRouter() {
  return createRouter(ROUTES, {} as never);
}

/* ══════════════ V-(а). Копия контейнера-валидатора на границе ══════════════ */
{
  // ARM O — оригинал; ARM C — мелкая копия { ...validator } (секции по ссылке).
  const run = (copy: boolean) => {
    const calls: string[] = [];
    const v = plainValidator("V", calls);
    const r = newRouter();
    const ctx = getInternals(r as never);
    const installed = copy ? { ...v } : v;
    (ctx as { validator: unknown }).validator = installed;
    const path = r.buildPath("u", { id: "1" });
    const act = r.isActiveRoute("u", { id: "1" });
    const readBackIsInstalled =
      (ctx as { validator: unknown }).validator === installed;
    const pluginSeesOwnObject = (ctx as { validator: unknown }).validator === v;
    // строка validationPlugin.ts · `ctx.validator.options.validateOptions(...)`
    let readBackWorks = "ok";
    try {
      (
        (ctx as { validator: Record<string, Record<string, () => void>> })
          .validator.options.validateOptions as unknown as (
          a: unknown,
          b: string,
        ) => void
      )({}, "retrospective");
    } catch (e) {
      readBackWorks = (e as Error).constructor.name;
    }
    return {
      calls: calls.join("|"),
      path,
      act,
      readBackIsInstalled,
      pluginSeesOwnObject,
      readBackWorks,
    };
  };
  const O = run(false);
  const C = run(true);
  out.Va_plainOriginal = O;
  out.Va_plainCopy = C;
  out.Va_plainEquivalent =
    O.calls === C.calls && O.path === C.path && O.act === C.act;
}

/* ══════════ V-(а2). Виртуальный контейнер (форма core/tests/helpers/spyValidator.ts) ══════════ */
{
  const run = (copy: boolean) => {
    const calls: string[] = [];
    // тот же приём, что в spyValidator.ts: секции материализуются лениво,
    // СОБСТВЕННЫХ ключей у контейнера нет.
    const virtual = new Proxy({} as Record<string, object>, {
      get(_t, k) {
        if (typeof k !== "string") return undefined;
        return makeSection(`VV.${k}`, calls);
      },
    });
    const r = newRouter();
    const ctx = getInternals(r as never);
    const installed = copy ? { ...virtual } : virtual;
    (ctx as { validator: unknown }).validator = installed;
    let frameThrew = "no";
    try {
      r.buildPath("u", { id: "1" });
      r.isActiveRoute("u", { id: "1" });
    } catch (e) {
      frameThrew = `${(e as Error).constructor.name}: ${(e as Error).message}`;
    }
    let readBack = "ok";
    try {
      (
        (ctx as { validator: Record<string, Record<string, () => void>> })
          .validator.options.validateOptions as unknown as (
          a: unknown,
          b: string,
        ) => void
      )({}, "retrospective");
    } catch (e) {
      readBack = `${(e as Error).constructor.name}: ${(e as Error).message}`;
    }
    return {
      ownKeysOfInstalled: Object.keys(installed as object).length,
      validatorCallsPerFrame: calls.length,
      frameThrew,
      pluginReadBack: readBack,
    };
  };
  out.Va2_virtualOriginal = run(false);
  out.Va2_virtualCopy = run(true);
}

/* ══════ V-(а3). Копия ПО ИМЕНАМ восьми объявленных секций (не spread) ══════ */
// RouterValidator.ts объявляет РОВНО 8 секций: routes/options/dependencies/
// plugins/lifecycle/navigation/state/eventBus. Копия, читающая их по имени,
// работает и над виртуальным контейнером — spread не работает.
{
  const byName = (v: Record<string, object>) => {
    const t: Record<string, unknown> = Object.create(null);
    for (const s of SECTIONS) t[s] = v[s];
    return t;
  };
  const arm = (kind: "plain" | "virtual") => {
    const calls: string[] = [];
    const v =
      kind === "plain"
        ? plainValidator("N", calls)
        : (new Proxy({} as Record<string, object>, {
            get(_t, k) {
              if (typeof k !== "string") return undefined;
              return makeSection(`N.${k}`, calls);
            },
          }) as Record<string, object>);
    const r = newRouter();
    const ctx = getInternals(r as never);
    (ctx as { validator: unknown }).validator = byName(v);
    let threw = "no";
    try {
      r.buildPath("u", { id: "1" });
      r.isActiveRoute("u", { id: "1" });
      (
        (ctx as { validator: Record<string, Record<string, () => void>> })
          .validator.options.validateOptions as unknown as (
          a: unknown,
          b: string,
        ) => void
      )({}, "retrospective");
    } catch (e) {
      threw = `${(e as Error).constructor.name}: ${(e as Error).message}`;
    }
    return { kind, calls: calls.length, threw, sequence: calls.join("|") };
  };
  out.Va3_byNameCopy_plain = arm("plain");
  out.Va3_byNameCopy_virtual = arm("virtual");
}

/* ═════════════════════════ V-P1. Один проход на ключ ═════════════════════════ */
{
  const frame = (
    name: string,
    fn: (r: ReturnType<typeof newRouter>) => void,
  ) => {
    const calls: string[] = [];
    const cv = countingValidator("P1", calls);
    const r = newRouter();
    (getInternals(r as never) as { validator: unknown }).validator =
      cv.container;
    fn(r);
    return { frame: name, reads: { ...cv.reads }, calls: calls.length };
  };
  out.VP1_isActiveRoute = frame("isActiveRoute", (r) =>
    r.isActiveRoute("u", { id: "1" }),
  );
  out.VP1_buildPath = frame("buildPath", (r) => {
    r.buildPath("u", { id: "1" });
  });
  out.VP1_canNavigateTo = frame("canNavigateTo", (r) => {
    r.canNavigateTo("u", { id: "1" });
  });
  out.VP1_makeState = frame("makeState", (r) => {
    getPluginApi(r as never).makeState("u", { id: "1" });
  });

  // ДРЕЙФ: `routes` отвечает секцией A на 1-е чтение и секцией B на 2-е.
  // Если ядро читает ключ дважды — вторая проверка уйдёт в ДРУГОЙ объект.
  {
    const calls: string[] = [];
    const A = makeSection("A", calls);
    const B = makeSection("B", calls);
    const reads: Record<string, number> = {};
    const target = plainValidator("base", calls);
    const container = new Proxy(target, {
      get(t, k, r2) {
        if (typeof k !== "string") return Reflect.get(t, k, r2);
        reads[k] = (reads[k] ?? 0) + 1;
        if (k === "routes") return reads[k] === 1 ? A : B;
        return Reflect.get(t, k, r2);
      },
    });
    const r = newRouter();
    (getInternals(r as never) as { validator: unknown }).validator = container;
    r.isActiveRoute("u", { id: "1" });
    out.VP1_driftRoutes = { calls: calls.join("|"), reads: { ...reads } };
  }
}

/* ═══════════ V-P2. Лгущий Proxy: ownKeys/hasOwn ядром не спрашиваются ═══════════ */
{
  const calls: string[] = [];
  const traps: string[] = [];
  const liar = new Proxy({} as Record<string, object>, {
    ownKeys(t) {
      traps.push("ownKeys");
      return Reflect.ownKeys(t);
    },
    getOwnPropertyDescriptor(_t, k) {
      traps.push(`gopd:${String(k)}`);
      return {
        value: undefined,
        writable: true,
        enumerable: true,
        configurable: true,
      };
    },
    has(_t, k) {
      traps.push(`has:${String(k)}`);
      return true;
    },
    get(_t, k) {
      if (typeof k !== "string") return undefined;
      return makeSection(`L.${k}`, calls);
    },
  });
  const r = newRouter();
  (getInternals(r as never) as { validator: unknown }).validator = liar;
  r.isActiveRoute("u", { id: "1" });
  r.buildPath("u", { id: "1" });
  out.VP2 = {
    validatorCalls: calls.length,
    enumerationTrapsFired: traps.length,
    trapNames: traps.slice(0, 5),
    ownKeysVisible: Object.keys(liar).length,
  };
}

/* ══════════════ V-P3/P4. Ядро в объект валидатора не пишет и не морозит ══════════════ */
{
  const calls: string[] = [];
  const v = plainValidator("F", calls);
  Object.freeze(v);
  let frozenWriteThrows = "no";
  try {
    (v as Record<string, unknown>).routes = {};
  } catch (e) {
    frozenWriteThrows = (e as Error).constructor.name;
  }
  const r = newRouter();
  const ctx = getInternals(r as never);
  (ctx as { validator: unknown }).validator = v;
  let frameThrew = "no";
  try {
    r.buildPath("u", { id: "1" });
    r.isActiveRoute("u", { id: "1" });
  } catch (e) {
    frameThrew = (e as Error).message;
  }
  // и обратное: незамороженный валидатор ядром НЕ замораживается
  const calls2: string[] = [];
  const v2 = plainValidator("G", calls2);
  const r2 = newRouter();
  (getInternals(r2 as never) as { validator: unknown }).validator = v2;
  r2.buildPath("u", { id: "1" });
  out.VP3P4 = {
    frozenValidatorAccepted: frameThrew,
    callsOnFrozenValidator: calls.length,
    frozenWriteThrows,
    coreFrozeCallersValidator: Object.isFrozen(v2),
    sectionFrozenByCore: Object.isFrozen(v2.routes),
  };
}

/* ══════════════ I-(а). Копия массива-цепочки на границе `.set` ══════════════ */
{
  // ARM O: массив вызывающего живёт в Map (сегодня). ARM C: ядро скопировало на .set.
  const run = (copyAtSet: boolean) => {
    const r = newRouter();
    const api = getPluginApi(r as never);
    const ctx = getInternals(r as never);
    let legal = 0;
    // ПОЗИТИВНЫЙ КОНТРОЛЬ: штатная регистрация исполняется.
    const unsub = api.addInterceptor("forwardState", ((
      next: never,
      ...a: never[]
    ) => {
      legal++;
      return (next as never as (...x: never[]) => never)(...a);
    }) as never);
    r.buildPath("u", { id: "1" });
    const legalRan = legal;

    // вызывающий подставляет СВОЙ массив
    let foreign = 0;
    const mine: unknown[] = [
      (next: (...x: never[]) => never, ...a: never[]) => {
        foreign++;
        return next(...a);
      },
    ];
    ctx.interceptors.set(
      "forwardState",
      (copyAtSet ? [...mine] : mine) as never,
    );
    r.buildPath("u", { id: "2" });
    const foreignRan = foreign;

    // ДРЕЙФ: поздний push в массив ВЫЗЫВАЮЩЕГО
    let late = 0;
    mine.push((next: (...x: never[]) => never, ...a: never[]) => {
      late++;
      return next(...a);
    });
    r.buildPath("u", { id: "3" });

    // штатная регистрация ПОСЛЕ подстановки — идёт в массив из Map
    let after = 0;
    const unsub2 = api.addInterceptor("forwardState", ((
      next: never,
      ...a: never[]
    ) => {
      after++;
      return (next as never as (...x: never[]) => never)(...a);
    }) as never);
    r.buildPath("u", { id: "4" });
    const afterRan = after;
    // отписка штатного интерцептора должна его снять
    unsub2();
    after = 0;
    r.buildPath("u", { id: "5" });
    unsub();
    return {
      legalRan,
      foreignRan,
      lateAddedRan: late,
      afterSwapRegisteredRan: afterRan,
      afterUnsubscribeRan: after,
    };
  };
  out.Ia_original = run(false);
  out.Ia_copyAtSet = run(true);
}

/* ═════════ I-P1. `chain.length` спрашивается, потом цепочка применяется ═════════ */
{
  // считающий Proxy поверх настоящего массива, установленный в Map вызывающим
  const r = newRouter();
  const ctx = getInternals(r as never);
  let ran = 0;
  const real: unknown[] = [
    (next: (...x: never[]) => never, ...a: never[]) => {
      ran++;
      return next(...a);
    },
  ];
  const reads: Record<string, number> = {};
  const counted = new Proxy(real, {
    get(t, k, rec) {
      if (typeof k === "string") reads[k] = (reads[k] ?? 0) + 1;
      return Reflect.get(t, k, rec);
    },
  });
  ctx.interceptors.set("forwardState", counted as never);
  r.buildPath("u", { id: "1" });
  out.IP1_readsPerFrame = { reads: { ...reads }, interceptorRan: ran };

  // ЛГУЩАЯ ДЛИНА: 0 на первом чтении (гейт), настоящая — дальше.
  const r2 = newRouter();
  const ctx2 = getInternals(r2 as never);
  let ran2 = 0;
  const real2: unknown[] = [
    (next: (...x: never[]) => never, ...a: never[]) => {
      ran2++;
      return next(...a);
    },
  ];
  let lenReads = 0;
  const liar = new Proxy(real2, {
    get(t, k, rec) {
      if (k === "length") {
        lenReads++;
        return lenReads === 1 ? 0 : (t as unknown[]).length;
      }
      return Reflect.get(t, k, rec);
    },
  });
  ctx2.interceptors.set("forwardState", liar as never);
  const p = r2.buildPath("u", { id: "1" });
  out.IP1_lyingLength = {
    lengthReads: lenReads,
    interceptorRan: ran2,
    path: p,
    verdict:
      ran2 === 0
        ? "гейт и применение — два независимых чтения length; цепочка молча пропущена"
        : "одно чтение",
  };
}

/* ═════════ I-P2. Перечисление — итератором массива, не ownKeys/hasOwn ═════════ */
{
  const r = newRouter();
  const ctx = getInternals(r as never);
  const traps: string[] = [];
  let ran = 0;
  const real: unknown[] = [
    (next: (...x: never[]) => never, ...a: never[]) => {
      ran++;
      return next(...a);
    },
  ];
  const watched = new Proxy(real, {
    ownKeys(t) {
      traps.push("ownKeys");
      return Reflect.ownKeys(t);
    },
    has(t, k) {
      traps.push(`has:${String(k)}`);
      return Reflect.has(t, k);
    },
    getOwnPropertyDescriptor(t, k) {
      traps.push(`gopd:${String(k)}`);
      return Reflect.getOwnPropertyDescriptor(t, k);
    },
  });
  ctx.interceptors.set("forwardState", watched as never);
  r.buildPath("u", { id: "1" });
  out.IP2 = { interceptorRan: ran, enumerationTraps: traps };
}

/* ═════════ I-P3. `list.push(fn)` — [[Set]] в массив с прототипом ═════════ */
{
  // ПОЗИТИВНЫЙ КОНТРОЛЬ: без аксессора интерцептор регистрируется и бежит.
  const rc = newRouter();
  let ctrl = 0;
  getPluginApi(rc as never).addInterceptor("forwardState", ((
    next: never,
    ...a: never[]
  ) => {
    ctrl++;
    return (next as never as (...x: never[]) => never)(...a);
  }) as never);
  rc.buildPath("u", { id: "1" });

  const r = newRouter();
  const api = getPluginApi(r as never);
  const ctx = getInternals(r as never);
  let setterHits = 0;
  let stolen: unknown;
  let hostileRan = 0;
  let pushThrew = "no";
  Object.defineProperty(Object.prototype, "0", {
    configurable: true,
    get() {
      return undefined;
    },
    set(v: unknown) {
      setterHits++;
      stolen = v;
    },
  });
  try {
    api.addInterceptor("forwardState", ((next: never, ...a: never[]) => {
      hostileRan++;
      return (next as never as (...x: never[]) => never)(...a);
    }) as never);
  } catch (e) {
    pushThrew = (e as Error).constructor.name;
  } finally {
    // фиксируем состояние массива ДО снятия аксессора
    const chain = ctx.interceptors.get("forwardState") as unknown[] | undefined;
    out.IP3 = {
      controlInterceptorRan: ctrl,
      inheritedSetterHits: setterHits,
      setterStoleTheInterceptor: typeof stolen === "function",
      chainLength: chain?.length,
      chainSlotIsOwn: chain ? Object.hasOwn(chain, 0) : undefined,
      pushThrew,
    };
    delete (Object.prototype as unknown as Record<string, unknown>)[0];
  }
  // после снятия аксессора: что ядро исполнит на кадре?
  let post = "n/a";
  try {
    r.buildPath("u", { id: "2" });
    post = `hostileRan=${hostileRan}`;
  } catch (e) {
    post = `${(e as Error).constructor.name}: ${(e as Error).message}`;
  }
  (out.IP3 as Record<string, unknown>).frameAfterAccessorRemoved = post;
}

/* ═════════════════════ I-P4. Заморозка уровней ═════════════════════ */
{
  const r = newRouter();
  const api = getPluginApi(r as never);
  const ctx = getInternals(r as never);
  api.addInterceptor("forwardState", ((next: never, ...a: never[]) =>
    (next as never as (...x: never[]) => never)(...a)) as never);
  r.buildPath("u", { id: "1" });
  const coreBorn = ctx.interceptors.get("forwardState") as unknown[];
  const mine: unknown[] = [];
  ctx.interceptors.set("forwardState", mine as never);
  r.buildPath("u", { id: "2" });
  out.IP4 = {
    coreBornChainFrozen: Object.isFrozen(coreBorn),
    mapFrozen: Object.isFrozen(ctx.interceptors),
    callersChainFrozenByCore: Object.isFrozen(mine),
  };
}

console.log(JSON.stringify(out, null, 1));
