/**
 * МАТРИЦА семейства «options·spread+freeze», часть A — эксперимент (а).
 * Строки: D1 createRouter·options, D2 createRouter·options.limits,
 *         D3 createRouter·options.logger, D4 cloneRouter·opts.logger.
 * Все наблюдения снаружи src.
 */
import { createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi } from "@real-router/core/api";

import { getInternals } from "../../../../packages/core/src/internals";

const R = [{ name: "u", path: "/u/:id?tab" }] as never;
const say = (k: string, v: unknown): void =>
  console.log(`${k}: ${JSON.stringify(v)}`);
const line = (t: string): void => console.log(`\n===== ${t} =====`);

// ---------------------------------------------------------------------------
line("ПОЗИТИВНЫЙ КОНТРОЛЬ СРЕДЫ");
{
  const cb: string[] = [];
  const r = createRouter(R, {
    logger: {
      level: "all",
      callback: (l: string, c: string, m: string) => cb.push(`${l}:${c}:${m}`),
    },
    limits: { maxListeners: 2 },
    queryParams: { arrayFormat: "brackets" },
  } as never);
  const opts = getPluginApi(r).getOptions() as unknown as Record<
    string,
    unknown
  >;
  say("PC · getOptions() frozen", Object.isFrozen(opts));
  say("PC · getOptions().queryParams", opts.queryParams);
  say("PC · logger stripped from options", opts.logger);
  let threw = "";
  try {
    for (let i = 0; i < 5; i++) r.subscribe(() => {});
  } catch (e) {
    threw = (e as Error).message;
  }
  say("PC · maxListeners=2 REALLY bound", threw.slice(0, 70));
  try {
    (r as unknown as { canNavigateTo: (n: string) => boolean }).canNavigateTo(
      "nope",
    );
  } catch {
    /* ignore */
  }
  say("PC · logger callback REALLY wired (records)", cb.length);
  say("PC · sample record", cb[0]);
}

// ---------------------------------------------------------------------------
line("(a) D1 createRouter·options — оригинал против предкопии");
{
  const leafQuery = { arrayFormat: "brackets" };
  const leafLimits = { maxListeners: 5 };
  const original: Record<string, unknown> = {
    queryParams: leafQuery,
    limits: leafLimits,
    defaultRoute: "u",
    zzUnknown: "kept?",
  };
  const shallow = { ...original };

  const build = (
    o: Record<string, unknown>,
  ): Record<string, unknown> & { opts: Record<string, unknown> } => {
    const r = createRouter(R, o as never);
    const opts = getPluginApi(r).getOptions() as unknown as Record<
      string,
      unknown
    >;
    const cs = getInternals(r as never).getCloneState();
    return {
      opts,
      snapshot: JSON.stringify(opts),
      frozen: Object.isFrozen(opts),
      unknownKept: opts.zzUnknown,
      identityToCaller: (opts as unknown) === o,
      queryLeafIdentity: opts.queryParams === leafQuery,
      limitsLeafIdentity: opts.limits === leafLimits,
      cloneLimits: JSON.stringify(cs.limits),
      cloneLimitKeys: JSON.stringify(cs.limitKeys),
      href: r.buildPath("u", { id: "7" } as never),
      cloneHref: cloneRouter(r as never).buildPath("u", { id: "7" } as never),
    };
  };
  const A = build(original);
  const B = build(shallow);
  say("D1 · snapshot ориг", A.snapshot);
  say("D1 · snapshot копия", B.snapshot);
  say("D1 · snapshots равны", A.snapshot === B.snapshot);
  say("D1 · frozen [ориг,копия]", [A.frozen, B.frozen]);
  say("D1 · неизвестный ключ уцелел [ориг,копия]", [
    A.unknownKept,
    B.unknownKept,
  ]);
  say("D1 · getOptions() === объект вызывающего [ориг,копия]", [
    A.identityToCaller,
    B.identityToCaller,
  ]);
  say("D1 · листья по ссылке [query,limits] ориг", [
    A.queryLeafIdentity,
    A.limitsLeafIdentity,
  ]);
  say("D1 · листья по ссылке [query,limits] копия", [
    B.queryLeafIdentity,
    B.limitsLeafIdentity,
  ]);
  say("D1 · cloneState.limits [ориг,копия]", [A.cloneLimits, B.cloneLimits]);
  say("D1 · cloneState.limitKeys [ориг,копия]", [
    A.cloneLimitKeys,
    B.cloneLimitKeys,
  ]);
  say("D1 · href/cloneHref ориг", [A.href, A.cloneHref]);
  say("D1 · href/cloneHref копия", [B.href, B.cloneHref]);

  original.defaultRoute = "MUTATED";
  original.newKey = "added-later";
  say("D1 · после мутации оригинала getOptions() [defaultRoute,newKey]", [
    A.opts.defaultRoute,
    A.opts.newKey,
  ]);
  let writeThrew = false;
  try {
    A.opts.defaultRoute = "x";
  } catch {
    writeThrew = true;
  }
  say("D1 · запись в хэндаут getOptions() бросает", writeThrew);
  say("D1 · P4 мешок вызывающего заморожен?", Object.isFrozen(original));
  say("D1 · P4 вложенный queryParams вызывающего заморожен?", Object.isFrozen(leafQuery));
  say("D1 · P4 вложенный limits вызывающего заморожен?", Object.isFrozen(leafLimits));
}

// ---------------------------------------------------------------------------
line("(a) D2 createRouter·options.limits — оригинал против предкопии");
{
  const capOf = (r: { subscribe: (f: () => void) => unknown }): number => {
    let n = 0;
    try {
      for (let i = 0; i < 40; i++) {
        r.subscribe(() => {});
        n++;
      }
    } catch {
      /* n = принятое */
    }
    return n;
  };
  const mk = (limits: Record<string, unknown>): Record<string, unknown> => {
    const r = createRouter(R, { limits } as never);
    const opts = getPluginApi(r).getOptions() as unknown as Record<
      string,
      unknown
    >;
    const cs = getInternals(r as never).getCloneState();
    const cloneCap = capOf(cloneRouter(r as never) as never);
    return {
      identity: opts.limits === limits,
      frozenCallerBag: Object.isFrozen(limits),
      resolved: JSON.stringify(cs.limits),
      keys: JSON.stringify(cs.limitKeys),
      cap: capOf(r as never),
      cloneCap,
    };
  };
  const raw = { maxListeners: 3 };
  const A = mk(raw);
  const B = mk({ ...raw });
  say("D2 · resolved [ориг,копия]", [A.resolved, B.resolved]);
  say("D2 · limitKeys [ориг,копия]", [A.keys, B.keys]);
  say("D2 · cap базы [ориг,копия]", [A.cap, B.cap]);
  say("D2 · cap клона [ориг,копия]", [A.cloneCap, B.cloneCap]);
  say("D2 · getOptions().limits === мешок вызывающего [ориг,копия]", [
    A.identity,
    B.identity,
  ]);
  say("D2 · P4 мешок вызывающего заморожен? [ориг,копия]", [
    A.frozenCallerBag,
    B.frozenCallerBag,
  ]);

  const late: Record<string, unknown> = { maxListeners: 3 };
  const r = createRouter(R, { limits: late } as never);
  late.maxListeners = 30;
  const c = cloneRouter(r as never);
  let n = 0;
  try {
    for (let i = 0; i < 40; i++) {
      c.subscribe(() => {});
      n++;
    }
  } catch {
    /* n */
  }
  say("D2 · мутация limits ПОСЛЕ createRouter → cap клона", n);
  say(
    "D2 · но getOptions().limits ПОКАЗЫВАЕТ мутацию (хэндаут по ссылке)",
    JSON.stringify(
      (getPluginApi(r).getOptions() as unknown as Record<string, unknown>)
        .limits,
    ),
  );
}

// ---------------------------------------------------------------------------
line("(a) D3/D4 logger — оригинал против предкопии + обратная видимость");
{
  // Триггер логгера: warnListeners=1 → второй subscribe() зовёт
  // onListenerWarn → logger.warn("router.addEventListener", …).
  const LIM = { warnListeners: 1, maxListeners: 500 };
  const warmWarn = (r: unknown): void => {
    (r as { subscribe: (f: () => void) => unknown }).subscribe(() => {});
    (r as { subscribe: (f: () => void) => unknown }).subscribe(() => {});
  };
  const seenA: string[] = [];
  const cbA = (l: string, c: string): number => seenA.push(`${l}:${c}`);
  const cfg: Record<string, unknown> = { level: "all", callback: cbA };
  const rOrig = createRouter(R, { logger: cfg, limits: LIM } as never);
  const rCopy = createRouter(R, { logger: { ...cfg }, limits: LIM } as never);
  const cs1 = getInternals(rOrig as never).getCloneState();
  const cs2 = getInternals(rCopy as never).getCloneState();
  say("D3 · loggerConfig ориг", JSON.stringify(cs1.loggerConfig));
  say("D3 · loggerConfig копия", JSON.stringify(cs2.loggerConfig));
  say("D3 · loggerConfig === мешок вызывающего [ориг,копия]", [
    (cs1.loggerConfig as unknown) === cfg,
    (cs2.loggerConfig as unknown) === cfg,
  ]);
  say("D3 · loggerConfig.callback === колбэк вызывающего (ЛИСТ) [ориг,копия]", [
    cs1.loggerConfig.callback === cbA,
    cs2.loggerConfig.callback === cbA,
  ]);
  say("D3 · P4 мешок logger вызывающего заморожен?", Object.isFrozen(cfg));
  warmWarn(rOrig);
  say("D3 · оригинальный callback получил записи", seenA.length);
  const swapped: string[] = [];
  cfg.callback = (l: string, c: string): number => swapped.push(`${l}:${c}`);
  warmWarn(rOrig);
  say("D3 · подмена callback ПОСЛЕ createRouter видна ядру?", swapped.length);
  say("D3 · оригинальный callback продолжает получать", seenA.length);

  const base = createRouter(R, { logger: { level: "all" }, limits: LIM } as never);
  const seenC: string[] = [];
  const ov: Record<string, unknown> = {
    callback: (l: string, c: string): number => seenC.push(`${l}:${c}`),
  };
  const clone = cloneRouter(base as never, undefined, {
    logger: ov as never,
  });
  const csC = getInternals(clone as never).getCloneState();
  say("D4 · clone loggerConfig", JSON.stringify(csC.loggerConfig));
  say(
    "D4 · clone loggerConfig === мешок вызывающего",
    (csC.loggerConfig as unknown) === ov,
  );
  say(
    "D4 · clone loggerConfig.callback === колбэк вызывающего (ЛИСТ)",
    csC.loggerConfig.callback === ov.callback,
  );
  warmWarn(clone);
  say("D4 · override ДОШЁЛ до логгера клона", seenC.length);
  const before = seenC.length;
  ov.callback = (): void => {};
  warmWarn(clone);
  say("D4 · подмена callback ПОСЛЕ клонирования видна клону?", seenC.length > before);
  const seenD: string[] = [];
  const ov2: Record<string, unknown> = {
    callback: (l: string, c: string): number => seenD.push(`${l}:${c}`),
  };
  const clone2 = cloneRouter(base as never, undefined, {
    logger: { ...ov2 } as never,
  });
  warmWarn(clone2);
  say("D4 · с предкопией override всё равно дошёл", seenD.length);
  say("D4 · P4 мешок override вызывающего заморожен?", Object.isFrozen(ov2));
}
