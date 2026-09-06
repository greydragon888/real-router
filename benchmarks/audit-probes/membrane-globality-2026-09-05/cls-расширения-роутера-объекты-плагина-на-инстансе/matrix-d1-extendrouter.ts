// D1 · PluginApi.extendRouter·extensions — матрица: эксперимент (а) + P1..P4.
// Каждая секция печатает ОДНУ строку JSON с префиксом.
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import {
  countingBag,
  driftingBag,
} from "../../../../packages/core/tests/helpers/hostileBags";

const ROUTES = [{ name: "u", path: "/u/:id" }] as never;
const mk = (): any => createRouter(ROUTES, {} as never);
const out = (tag: string, o: unknown): void =>
  console.log(tag, JSON.stringify(o));

// ── HEADER · позитивный контроль инструмента ────────────────────────────────
{
  const r = mk();
  const { bag, reads } = countingBag({ id: "7" });
  const href = r.buildPath("u", bag as never);
  out("HEADER", {
    href,
    instrumentReads: reads,
    apiIsFrozen: Object.isFrozen(getPluginApi(r)),
  });
}

// ── A · ЭКСПЕРИМЕНТ (а): оригинал против ПРЕДВАРИТЕЛЬНО СКОПИРОВАННОГО контейнера
{
  const leafObj = { mutable: 1 };
  const leafFn = (): string => "leaf";
  const src = { xFoo: leafObj, xBar: leafFn };

  const run = (
    label: string,
    makeBag: () => Record<string, unknown>,
  ): unknown => {
    const r = mk();
    const api = getPluginApi(r);
    const bag = makeBag();
    const unsub = api.extendRouter(bag);
    const ctx = getInternals(r) as any;
    const rec = ctx.routerExtensions.map((e: any) => [...e.keys]);
    // обратная видимость: мутируем ОРИГИНАЛ мешка ПОСЛЕ вызова
    (bag as any).xNew = 42;
    (bag as any).xFoo = "REPLACED";
    const afterMutate = {
      hasNew: "xNew" in r,
      fooStillLeaf: (r as any).xFoo === leafObj,
    };
    // мутируем ЛИСТ — виден ли обеим сторонам
    leafObj.mutable = 2;
    const leafShared = (r as any).xFoo.mutable === 2 && src.xFoo.mutable === 2;
    const identity = {
      foo: (r as any).xFoo === leafObj,
      bar: (r as any).xBar === leafFn,
    };
    unsub();
    const afterUnsub = {
      fooGone: !("xFoo" in r),
      barGone: !("xBar" in r),
      recs: ctx.routerExtensions.length,
    };
    leafObj.mutable = 1;
    return { label, rec, afterMutate, leafShared, identity, afterUnsub };
  };

  const orig = run("ORIGINAL", () => ({ ...src }));
  const copied = run("PRE-COPIED", () => ({ ...{ ...src } }));
  out("A_experiment_a", {
    orig,
    copied,
    equalObservables:
      JSON.stringify({ ...(orig as any), label: 0 }) ===
      JSON.stringify({ ...(copied as any), label: 0 }),
  });
}

// ── P1 · ровно одно чтение на ключ, результат — от ПЕРВОГО чтения ───────────
{
  const r1 = mk();
  const { bag, reads } = countingBag({ p1a: "A", p1b: "B" });
  getPluginApi(r1).extendRouter(bag as Record<string, unknown>);
  const countingReads = { ...reads };

  const r2 = mk();
  const drift = driftingBag({ p1a: "FIRST" }, { p1a: "SECOND" });
  getPluginApi(r2).extendRouter(drift.bag as Record<string, unknown>);
  out("P1", {
    countingReads,
    installedValues: { p1a: (r1 as any).p1a, p1b: (r1 as any).p1b },
    driftReads: { ...drift.reads },
    driftInstalled: (r2 as any).p1a,
    verdict_installedIsFirstRead: (r2 as any).p1a === "FIRST",
  });
}

// ── P2 · лгущий Proxy: ownKeys НЕ называет ключ, gOPD утверждает «собственный»
{
  const r = mk();
  const target: Record<string, unknown> = { p2visible: "V" };
  let ghostGets = 0;
  const liar = new Proxy(target, {
    ownKeys: () => ["p2visible"],
    getOwnPropertyDescriptor: (t, k) =>
      k === "p2ghost"
        ? { value: "GHOST", enumerable: true, configurable: true, writable: true }
        : Reflect.getOwnPropertyDescriptor(t, k),
    has: (t, k) => k === "p2ghost" || Reflect.has(t, k),
    get: (t, k, rc) => {
      if (k === "p2ghost") {
        ghostGets += 1;

        return "GHOST";
      }

      return Reflect.get(t, k, rc);
    },
  });
  getPluginApi(r).extendRouter(liar);
  out("P2", {
    control_visibleInstalled: (r as any).p2visible === "V",
    ghostInstalled: "p2ghost" in r,
    ghostGets,
    verdict_ownKeysLed: !("p2ghost" in r) && ghostGets === 0,
  });
}

// ── P3 · унаследованный аксессор + собственный ключ "__proto__" ─────────────
{
  const r = mk();
  const NAME = "p3Ambient";
  let setterHits = 0;
  let threw: string | undefined;
  let installedAsOwn: boolean | undefined;
  Object.defineProperty(Object.prototype, NAME, {
    configurable: true,
    get(): unknown {
      return undefined;
    },
    set(): void {
      setterHits += 1;
    },
  });
  try {
    getPluginApi(r).extendRouter({ [NAME]: "V" });
    installedAsOwn = Object.hasOwn(r, NAME);
  } catch (e) {
    threw = (e as any).code ?? (e as Error).name;
  } finally {
    delete (Object.prototype as any)[NAME];
  }

  const r2 = mk();
  const protoBefore = Object.getPrototypeOf(r2);
  const wire = Object.assign(
    JSON.parse('{"__proto__":{"polluted":1}}'),
    {},
  ) as Record<string, unknown>;
  let protoThrew: string | undefined;

  try {
    getPluginApi(r2).extendRouter(wire);
  } catch (e) {
    protoThrew = (e as any).code ?? (e as Error).name;
  }

  // позитивный контроль: имя вне цепочки ставится обычным [[Set]]
  const r3 = mk();
  getPluginApi(r3).extendRouter({ p3Fresh: "OK" });

  out("P3", {
    ambient_threw: threw,
    ambient_setterHits: setterHits,
    ambient_installedAsOwn: installedAsOwn,
    wireOwnKeys: Object.keys(wire),
    proto_threw: protoThrew,
    prototypeUnchanged: Object.getPrototypeOf(r2) === protoBefore,
    globalNotPolluted: ({} as any).polluted === undefined,
    control_freshInstalled: (r3 as any).p3Fresh === "OK",
  });
}

// ── P4 · что заморожено после прохода двери ────────────────────────────────
{
  const r = mk();
  const nested = { deep: 1 };
  const bag: Record<string, unknown> = { p4Slot: nested };
  getPluginApi(r).extendRouter(bag);
  const ctx = getInternals(r) as any;
  const rec = ctx.routerExtensions[ctx.routerExtensions.length - 1];
  out("P4", {
    callersBagFrozen: Object.isFrozen(bag),
    callersNestedFrozen: Object.isFrozen(nested),
    coreBornRecordFrozen: Object.isFrozen(rec),
    coreBornKeysArrayFrozen: Object.isFrozen(rec.keys),
    routerFrozen: Object.isFrozen(r),
    control_untouchedLiteralFrozen: Object.isFrozen({}),
  });
}
