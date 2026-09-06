/**
 * МАТРИЦА семейства «options·spread+freeze», часть B — P1..P4.
 * D1 createRouter·options · D2 options.limits · D3 options.logger ·
 * D4 cloneRouter·opts.logger.
 */
import { createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi } from "@real-router/core/api";

import { getInternals } from "../../../../packages/core/src/internals";

const R = [{ name: "u", path: "/u/:id?tab" }] as never;
const say = (k: string, v: unknown): void =>
  console.log(`${k}: ${JSON.stringify(v)}`);
const line = (t: string): void => console.log(`\n===== ${t} =====`);

interface Traps {
  get: Record<string, number>;
  gopd: Record<string, number>;
  has: Record<string, number>;
  ownKeys: number;
}

/** Proxy, считающий КАЖДУЮ ловушку; valueFor может дрейфовать по n-му чтению. */
function tracer<T extends object>(
  source: T,
  valueFor?: (key: string, nth: number) => unknown,
  ownKeysFor?: (nth: number) => string[],
): { bag: T; t: Traps } {
  const t: Traps = { get: {}, gopd: {}, has: {}, ownKeys: 0 };
  const bag = new Proxy(source as Record<string, unknown>, {
    get(target, key, recv): unknown {
      if (typeof key === "string") {
        t.get[key] = (t.get[key] ?? 0) + 1;
        if (valueFor) return valueFor(key, t.get[key]);
      }
      return Reflect.get(target, key, recv);
    },
    getOwnPropertyDescriptor(target, key): PropertyDescriptor | undefined {
      if (typeof key === "string") t.gopd[key] = (t.gopd[key] ?? 0) + 1;
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
    has(target, key): boolean {
      if (typeof key === "string") t.has[key] = (t.has[key] ?? 0) + 1;
      return Reflect.has(target, key);
    },
    ownKeys(target): ArrayLike<string | symbol> {
      t.ownKeys += 1;
      if (ownKeysFor) return ownKeysFor(t.ownKeys);
      return Reflect.ownKeys(target);
    },
  });
  return { bag: bag as T, t };
}

// ===========================================================================
line("P1 — сколько раз ядро трогает мешок вызывающего");
{
  // D1: верхний уровень options
  const d1 = tracer({
    defaultRoute: "u",
    queryParams: { arrayFormat: "brackets" },
    zzUnknown: 1,
  });
  createRouter(R, d1.bag as never);
  say("P1 · D1 options traps", d1.t);

  // D2: вложенный limits
  const d2 = tracer({ maxListeners: 3, warnListeners: 2 });
  createRouter(R, { limits: d2.bag } as never);
  say("P1 · D2 options.limits traps", d2.t);

  // D3: вложенный logger
  const d3 = tracer({ level: "all", callback: (): void => {} });
  createRouter(R, { logger: d3.bag } as never);
  say("P1 · D3 options.logger traps", d3.t);

  // D4: opts.logger в cloneRouter (ТРЕТИЙ аргумент — форма из исходника)
  const base = createRouter(R, { logger: { level: "all" } } as never);
  const d4 = tracer({ callback: (): void => {} });
  cloneRouter(base as never, undefined, { logger: d4.bag as never });
  say("P1 · D4 cloneRouter opts.logger traps", d4.t);
}

// ===========================================================================
line("P1 — ДРЕЙФУЮЩИЙ ownKeys на D2 (два независимых прохода)");
{
  // Позитивный контроль: стабильный ownKeys → база и клон согласны.
  const stable = tracer({ maxListeners: 3, maxPlugins: 7 });
  const rc = createRouter(R, { limits: stable.bag } as never);
  say(
    "control · стабильный мешок → limitKeys",
    JSON.stringify(getInternals(rc as never).getCloneState().limitKeys),
  );
  say("control · ownKeys задан раз?", stable.t.ownKeys);

  // Дрейф: 1-й ownKeys (spread в createLimits) называет maxListeners,
  // 2-й (снапшот #limitKeys) называет maxPlugins.
  const target = { maxListeners: 3, maxPlugins: 7 };
  const drift = tracer(
    target,
    undefined,
    (nth) => (nth === 1 ? ["maxListeners"] : ["maxPlugins"]),
  );
  const r = createRouter(R, { limits: drift.bag } as never);
  const cs = getInternals(r as never).getCloneState();
  say("drift · ownKeys вызван раз", drift.t.ownKeys);
  say("drift · РАЗРЕШЁННЫЕ значения базы", JSON.stringify(cs.limits));
  say("drift · СНАПШОТ ключей (limitKeys)", JSON.stringify(cs.limitKeys));
  const clone = cloneRouter(r as never);
  const csc = getInternals(clone as never).getCloneState();
  say("drift · options клона (limits)", JSON.stringify(
    (getPluginApi(clone).getOptions() as unknown as Record<string, unknown>)
      .limits,
  ));
  say("drift · РАЗРЕШЁННЫЕ значения клона", JSON.stringify(csc.limits));
  const capOf = (x: { subscribe: (f: () => void) => unknown }): number => {
    let n = 0;
    try {
      for (let i = 0; i < 20; i++) {
        x.subscribe(() => {});
        n++;
      }
    } catch {
      /* n */
    }
    return n;
  };
  say("drift · cap базы", capOf(r as never));
  say("drift · cap клона", capOf(clone as never));
}

// ===========================================================================
line("P2 — лгущий Proxy: ownKeys не называет ключ, gOPD говорит «собственный»");
{
  const liarFor = (
    hidden: string,
    value: unknown,
  ): Record<string, unknown> => {
    const target: Record<string, unknown> = {};
    return new Proxy(target, {
      ownKeys: () => [],
      getOwnPropertyDescriptor: (_t, key) =>
        key === hidden
          ? { value, writable: true, enumerable: true, configurable: true }
          : undefined,
      get: (_t, key) => (key === hidden ? value : undefined),
      has: (_t, key) => key === hidden,
    });
  };

  // Позитивный контроль: ЧЕСТНЫЙ мешок с чужим ключом отвергается.
  let ctl = "";
  try {
    createRouter(R, { logger: { bogus: 1 } } as never);
  } catch (e) {
    ctl = (e as Error).message;
  }
  say("P2 control · честный чужой ключ отвергнут", ctl);

  // D3: лгущий мешок logger — ownKeys пуст (assertNoUnknownKeys молчит),
  // но hasOwn(obj,"callback") подтверждает ключ и его значение читается.
  const seen: string[] = [];
  const cb = (l: string, c: string): number => seen.push(`${l}:${c}`);
  const liar = liarFor("callback", cb);
  let threw = "";
  let r: unknown;
  try {
    r = createRouter(R, {
      logger: liar,
      limits: { warnListeners: 1, maxListeners: 500 },
    } as never);
  } catch (e) {
    threw = (e as Error).message;
  }
  say("P2 · D3 лгущий logger — бросил?", threw || false);
  if (!threw) {
    const cs = getInternals(r as never).getCloneState();
    say("P2 · D3 loggerConfig ядра", JSON.stringify(cs.loggerConfig));
    say(
      "P2 · D3 callback НЕназванного ownKeys ключа попал в ядро",
      cs.loggerConfig.callback === cb,
    );
    (r as { subscribe: (f: () => void) => unknown }).subscribe(() => {});
    (r as { subscribe: (f: () => void) => unknown }).subscribe(() => {});
    say("P2 · D3 и он ИСПОЛНЯЕТСЯ", seen.length);
  }

  // D1: тот же лгущий мешок как ВЕРХНИЙ options — попадёт ли ключ?
  const liarTop = liarFor("defaultRoute", "u");
  const r1 = createRouter(R, liarTop as never);
  say(
    "P2 · D1 options: лгущий ключ в getOptions()",
    (getPluginApi(r1).getOptions() as unknown as Record<string, unknown>)
      .defaultRoute,
  );

  // D2: лгущий мешок limits
  const liarLimits = liarFor("maxListeners", 2);
  const r2 = createRouter(R, { limits: liarLimits } as never);
  say(
    "P2 · D2 limits: разрешено ядром",
    JSON.stringify(getInternals(r2 as never).getCloneState().limits),
  );
  say(
    "P2 · D2 limitKeys",
    JSON.stringify(getInternals(r2 as never).getCloneState().limitKeys),
  );

  // D4: лгущий мешок как opts.logger клона
  const seen4: string[] = [];
  const cb4 = (l: string, c: string): number => seen4.push(`${l}:${c}`);
  const base = createRouter(R, {
    logger: { level: "all" },
    limits: { warnListeners: 1, maxListeners: 500 },
  } as never);
  const clone = cloneRouter(base as never, undefined, {
    logger: liarFor("callback", cb4) as never,
  });
  const csc = getInternals(clone as never).getCloneState();
  say("P2 · D4 clone loggerConfig", JSON.stringify(csc.loggerConfig));
  say("P2 · D4 лгущий callback попал в клон", csc.loggerConfig.callback === cb4);
}

// ===========================================================================
line("P3 — унаследованный аксессор и собственный __proto__");
{
  // --- позитивный контроль: аксессор ДЕЙСТВИТЕЛЬНО перехватывает [[Set]]
  const proto = Object.prototype as unknown as Record<string, unknown>;
  const trapped: unknown[] = [];
  Object.defineProperty(proto, "level", {
    configurable: true,
    get(): unknown {
      return undefined;
    },
    set(v: unknown): void {
      trapped.push(v);
    },
  });
  try {
    const witness: Record<string, unknown> = {};
    witness.level = "PROBE";
    say("P3 control · [[Set]] на литерале уходит в сеттер", trapped.length);
    say("P3 control · собственного ключа не появилось", Object.hasOwn(witness, "level"));

    // D3: logger.level="none" должен ЗАГЛУШИТЬ логгер
    const seen: string[] = [];
    const r = createRouter(R, {
      logger: {
        level: "none",
        callback: (l: string, c: string): number => seen.push(`${l}:${c}`),
      },
      limits: { warnListeners: 1, maxListeners: 500 },
    } as never);
    const cs = getInternals(r as never).getCloneState();
    say("P3 · D3 loggerConfig ядра при отравленном Object.prototype.level", JSON.stringify(cs.loggerConfig));
    say("P3 · D3 сеттер прототипа получил значение", trapped);
  } finally {
    delete proto.level;
  }
  say("P3 · прототип очищен", Object.hasOwn(proto, "level"));

  // Контроль без отравления
  const seen2: string[] = [];
  const r2 = createRouter(R, {
    logger: {
      level: "none",
      callback: (l: string, c: string): number => seen2.push(`${l}:${c}`),
    },
  } as never);
  say(
    "P3 control · без отравления loggerConfig",
    JSON.stringify(getInternals(r2 as never).getCloneState().loggerConfig),
  );

  // --- отравление имени "callback"
  // ⚠ Печать ОТЛОЖЕНА: отравленный `Object.prototype.callback` ломает
  // console.log процесса (stdout молча замолкает). Собираем и печатаем после
  // восстановления прототипа.
  const trapped2: unknown[] = [];
  const later: [string, unknown][] = [];
  Object.defineProperty(proto, "callback", {
    configurable: true,
    get(): unknown {
      return undefined;
    },
    set(v: unknown): void {
      trapped2.push(v);
    },
  });
  try {
    const seen3: string[] = [];
    const cb3 = (l: string, c: string): number => seen3.push(`${l}:${c}`);
    const r3 = createRouter(R, {
      logger: { level: "all", callback: cb3 },
      limits: { warnListeners: 1, maxListeners: 500 },
    } as never);
    const cs3 = getInternals(r3 as never).getCloneState();
    later.push(["P3 · D3 callback: сеттер прототипа перехватил", trapped2.length]);
    later.push(["P3 · D3 callback дошёл до ядра?", cs3.loggerConfig.callback === cb3]);
    (r3 as { subscribe: (f: () => void) => unknown }).subscribe(() => {});
    (r3 as { subscribe: (f: () => void) => unknown }).subscribe(() => {});
    later.push(["P3 · D3 callback исполнился (записей)", seen3.length]);
  } finally {
    delete proto.callback;
  }
  for (const [k, v] of later) say(k, v);
  say("P3 · прототип очищен (callback)", Object.hasOwn(proto, "callback"));

  // --- отравление имени ОПЦИИ верхнего уровня (D1) и лимита (D2)
  const trapped3: unknown[] = [];
  Object.defineProperty(proto, "defaultRoute", {
    configurable: true,
    get: (): unknown => undefined,
    set: (v: unknown): void => {
      trapped3.push(v);
    },
  });
  let d1Ok: unknown;
  try {
    const r4 = createRouter(R, { defaultRoute: "u" } as never);
    d1Ok = (getPluginApi(r4).getOptions() as unknown as Record<string, unknown>)
      .defaultRoute;
  } finally {
    delete proto.defaultRoute;
  }
  say("P3 · D1 defaultRoute уцелел при отравленном прототипе", d1Ok);
  say("P3 · D1 сеттер прототипа сработал?", trapped3.length);

  const trapped4: unknown[] = [];
  Object.defineProperty(proto, "maxListeners", {
    configurable: true,
    get: (): unknown => undefined,
    set: (v: unknown): void => {
      trapped4.push(v);
    },
  });
  let d2Ok: unknown;
  try {
    const r5 = createRouter(R, { limits: { maxListeners: 4 } } as never);
    d2Ok = JSON.stringify(getInternals(r5 as never).getCloneState().limits);
  } finally {
    delete proto.maxListeners;
  }
  say("P3 · D2 limits уцелели при отравленном прототипе", d2Ok);
  say("P3 · D2 сеттер прототипа сработал?", trapped4.length);

  // --- собственный "__proto__" из JSON.parse
  const jsonOpts = JSON.parse(
    '{"__proto__":{"polluted":"YES"},"defaultRoute":"u"}',
  ) as Record<string, unknown>;
  const r6 = createRouter(R, jsonOpts as never);
  const o6 = getPluginApi(r6).getOptions() as unknown as Record<string, unknown>;
  say("P3 · D1 own __proto__: остался ключом?", Object.hasOwn(o6, "__proto__"));
  say("P3 · D1 own __proto__: подменил прототип?", (o6 as { polluted?: unknown }).polluted);
  say("P3 · D1 own __proto__: прототип = Object.prototype?", Object.getPrototypeOf(o6) === Object.prototype);

  const jsonLimits = JSON.parse(
    '{"__proto__":{"polluted":"YES"},"maxListeners":4}',
  ) as Record<string, unknown>;
  const r7 = createRouter(R, { limits: jsonLimits } as never);
  const cs7 = getInternals(r7 as never).getCloneState();
  say("P3 · D2 own __proto__ в limits: limitKeys", JSON.stringify(cs7.limitKeys));
  say("P3 · D2 own __proto__ в limits: resolved", JSON.stringify(cs7.limits));
  const c7 = cloneRouter(r7 as never);
  const o7 = getPluginApi(c7).getOptions() as unknown as Record<string, unknown>;
  say("P3 · D2 клон: options.limits", JSON.stringify(o7.limits));
  say(
    "P3 · D2 клон: __proto__ в limits клона?",
    Object.hasOwn(o7.limits as object, "__proto__"),
  );

  let l8 = "";
  try {
    createRouter(R, {
      logger: JSON.parse('{"__proto__":{"x":1},"level":"all"}') as never,
    } as never);
  } catch (e) {
    l8 = (e as Error).message;
  }
  say("P3 · D3 own __proto__ в logger", l8 || "принят");

  const base9 = createRouter(R, { logger: { level: "all" } } as never);
  let l9 = "";
  try {
    cloneRouter(base9 as never, undefined, {
      logger: JSON.parse('{"__proto__":{"x":1},"level":"none"}') as never,
    });
  } catch (e) {
    l9 = (e as Error).message;
  }
  say("P3 · D4 own __proto__ в opts.logger", l9 || "принят");
}

// ===========================================================================
line("P4 — что заморожено");
{
  const q = { arrayFormat: "brackets" };
  const lim: Record<string, unknown> = { maxListeners: 4 };
  const log: Record<string, unknown> = { level: "all" };
  const dp = { id: "0" };
  const opts: Record<string, unknown> = {
    queryParams: q,
    limits: lim,
    logger: log,
    defaultParams: dp,
  };
  const r = createRouter(R, opts as never);
  const handed = getPluginApi(r).getOptions() as unknown as Record<
    string,
    unknown
  >;
  const cs = getInternals(r as never).getCloneState();
  say("P4 · уровень ЯДРА getOptions() frozen", Object.isFrozen(handed));
  say("P4 · уровень ЯДРА cloneState.limits frozen", Object.isFrozen(cs.limits));
  say("P4 · уровень ЯДРА cloneState.limitKeys frozen", Object.isFrozen(cs.limitKeys));
  say("P4 · уровень ЯДРА cloneState.loggerConfig frozen", Object.isFrozen(cs.loggerConfig));
  say("P4 · мешок вызывающего options frozen", Object.isFrozen(opts));
  say("P4 · вложенный queryParams вызывающего frozen", Object.isFrozen(q));
  say("P4 · вложенный limits вызывающего frozen", Object.isFrozen(lim));
  say("P4 · вложенный logger вызывающего frozen", Object.isFrozen(log));
  say("P4 · вложенный defaultParams вызывающего frozen", Object.isFrozen(dp));
  say("P4 · getOptions().limits === мешок вызывающего", handed.limits === lim);

  const base = createRouter(R, { logger: { level: "all" } } as never);
  const ov: Record<string, unknown> = { level: "none" };
  const clone = cloneRouter(base as never, undefined, { logger: ov as never });
  say("P4 · D4 мешок opts.logger вызывающего frozen", Object.isFrozen(ov));
  say(
    "P4 · D4 clone loggerConfig frozen",
    Object.isFrozen(getInternals(clone as never).getCloneState().loggerConfig),
  );
  say("P4 · D4 clone getOptions() frozen", Object.isFrozen(getPluginApi(clone).getOptions()));
}
