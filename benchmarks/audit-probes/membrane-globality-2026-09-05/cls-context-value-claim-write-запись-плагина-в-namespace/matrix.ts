// МАТРИЦА семейства «context-value · claim.write (запись плагина в namespace)».
// Строки — двери: A = ContextNamespaceClaim.write·state, B = ContextNamespaceClaim.write·value,
// C = RouterInternals.contextClaimRecords, D = createSsrLoaderPlugin·SsrLoaderFn·return,
// E = defer·options.deferred, F = defer·options.critical.
// Столбцы — эксперимент (а) [копия контейнера на границе], P1, P2, P3, P4.
// В каждой секции — позитивный контроль и доказательство, что вход ДОШЁЛ до ветки.
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import { countingBag, countingProxy } from "../../../../packages/core/tests/helpers/hostileBags";
import { createSsrLoaderPlugin } from "../../../../shared/ssr/createSsrLoaderPlugin";
import { DEFER_BRAND, defer } from "../../../../shared/ssr/defer";

const out: Record<string, unknown> = {};
const routes = [{ name: "u", path: "/u/:id" }] as never;
const mk = (): never => createRouter(routes, {} as never) as never;

const ssrCfg = {
  namespace: "data",
  modeNamespace: "ssrDataMode",
  deferredNamespace: "ssrDataDeferred",
  deferredKeysNamespace: "ssrDataDeferredKeys",
  errorPrefix: "[probe]",
};

type Ctx = Record<string, unknown>;
type St = { context: Ctx };

async function sectionA(): Promise<void> {
  // ---- A1 ПОЗИТИВНЫЙ КОНТРОЛЬ: штатная запись доходит до состояния ядра.
  {
    const router = mk();
    const claim = getPluginApi(router).claimContextNamespace("probe");
    const leaf = { mutable: 1 };

    (router as never as { usePlugin: (f: unknown) => unknown }).usePlugin(
      () => ({
        onTransitionSuccess: (toState: never) => {
          claim.write(toState, leaf);
        },
      }),
    );

    await (router as never as { start: (p: string) => Promise<St> }).start("/u/1");

    const st = (router as never as { getState: () => St }).getState();

    out.A1_control_landed = st.context.probe === leaf;
    out.A1_control_contextFrozen = Object.isFrozen(st.context);
    out.A1_control_shellFrozen = Object.isFrozen(st);
    out.A1_control_leafFrozen = Object.isFrozen(leaf); // P4: чужой лист не морозим
  }

  // ---- A2 ЭКСПЕРИМЕНТ (а): копия контейнера state на границе двери.
  {
    const router = mk();
    const claim = getPluginApi(router).claimContextNamespace("probe");
    const leaf = { mutable: 1 };
    let copySeenKey: unknown;

    (router as never as { usePlugin: (f: unknown) => unknown }).usePlugin(
      () => ({
        onTransitionSuccess: (toState: St) => {
          // (а): «скопировать контейнер один раз на границе и объекта вызывающего
          // больше не касаться» — здесь это копия state + копия state.context.
          const copied = { ...toState, context: { ...toState.context } };

          claim.write(copied as never, leaf);
          copySeenKey = (copied as St).context.probe === leaf;
        },
      }),
    );

    await (router as never as { start: (p: string) => Promise<St> }).start("/u/1");

    const st = (router as never as { getState: () => St }).getState();

    out.A2_copyArm_writeLandedInCopy = copySeenKey; // вход ДОШЁЛ до putField
    out.A2_copyArm_coreStateHasKey = Object.hasOwn(st.context, "probe");
    out.A2_copyArm_coreStateValue = st.context.probe;
  }

  // ---- A3 чужой State: ядро пишет В ПЕРЕДАННЫЙ объект и обратно его не читает.
  {
    const router = mk();
    const claim = getPluginApi(router).claimContextNamespace("probe");
    const leaf = { mutable: 1 };
    const foreign: St = { context: {} };

    await (router as never as { start: (p: string) => Promise<St> }).start("/u/1");
    claim.write(foreign as never, leaf);

    const st = (router as never as { getState: () => St }).getState();

    out.A3_foreignGotWrite = foreign.context.probe === leaf;
    out.A3_coreStateUntouched = !Object.hasOwn(st.context, "probe");
  }

  // ---- A4 P1/P2: сколько раз читается state и перечисляется ли он.
  {
    const router = mk();
    const claim = getPluginApi(router).claimContextNamespace("probe");
    const target: Ctx = {};
    const ownKeysCalls = { n: 0 };
    const counted = countingProxy({ context: target, name: "u", path: "/u/1" });
    const lying = new Proxy(counted.bag as unknown as object, {
      ownKeys(t) {
        ownKeysCalls.n += 1;

        return Reflect.ownKeys(t);
      },
    });

    claim.write(lying as never, { v: 1 });

    out.A4_stateReadsPerKey = { ...counted.reads };
    out.A4_ownKeysTrapCalls = ownKeysCalls.n;
    out.A4_control_writeLanded = Object.hasOwn(target, "probe");
  }

  // ---- A5 P3: унаследованный аксессор под именем namespace + own "__proto__".
  {
    const router = mk();
    const api = getPluginApi(router);
    const ambient = { setterCalls: 0, getterCalls: 0 };
    let threw: string | null = null;
    const targetA: Ctx = {};

    Object.defineProperty(Object.prototype, "ambientNs", {
      configurable: true,
      get() {
        ambient.getterCalls += 1;

        return "from-prototype";
      },
      set() {
        ambient.setterCalls += 1;
      },
    });

    try {
      const claimA = api.claimContextNamespace("ambientNs");

      try {
        claimA.write({ context: targetA } as never, { v: 1 });
      } catch (error) {
        threw = String(error);
      }
    } finally {
      delete (Object.prototype as unknown as Ctx).ambientNs;
    }

    out.A5_ambient_threw = threw;
    out.A5_ambient_setterCalls = ambient.setterCalls;
    out.A5_ambient_ownKeyLanded = Object.hasOwn(targetA, "ambientNs");
    out.A5_ambient_valueIsMine =
      (targetA.ambientNs as { v?: number } | undefined)?.v === 1;

    const claimP = api.claimContextNamespace("__proto__");
    const targetP: Ctx = {};
    const payload = { v: 2 };

    claimP.write({ context: targetP } as never, payload);

    out.A5_protoKey_ownKeys = Object.getOwnPropertyNames(targetP);
    out.A5_protoKey_prototypeIntact =
      Object.getPrototypeOf(targetP) === Object.prototype;
    out.A5_protoKey_valueKept =
      Object.getOwnPropertyDescriptor(targetP, "__proto__")?.value === payload;
  }
}

async function sectionB(): Promise<void> {
  // ---- B1 лист по ссылке переживает копию контейнера на коммит-двери (семя 1),
  //      и виден через КАЖДЫЙ наблюдатель двери.
  const router = mk();
  const claim = getPluginApi(router).claimContextNamespace("probe");
  const leaf = new Map<string, number>([["k", 1]]);
  const seen: Record<string, unknown> = {};
  let containerAtWrite: Ctx | null = null;
  const valueReads = { n: 0 };
  const countedLeaf = new Proxy(leaf as unknown as object, {
    get(t, k, r) {
      valueReads.n += 1;

      return Reflect.get(t, k, r);
    },
  });

  (router as never as { usePlugin: (f: unknown) => unknown }).usePlugin(
    () => ({
      onTransitionSuccess: (toState: St, fromState: St | undefined) => {
        containerAtWrite ??= toState.context;
        claim.write(toState as never, countedLeaf);
        seen.hook_fromContextLeaf =
          fromState === undefined ? "no-from" : fromState.context.probe === countedLeaf;
      },
    }),
  );

  await (router as never as { start: (p: string) => Promise<St> }).start("/u/1");

  const st1 = (router as never as { getState: () => St }).getState();

  seen.getState_leaf = st1.context.probe === countedLeaf;
  seen.containerCopiedAtCommit = st1.context !== containerAtWrite;

  (router as never as { subscribe: (f: unknown) => unknown }).subscribe(
    (payload: { previousRoute?: St }) => {
      seen.subscribe_previousRouteLeaf =
        payload.previousRoute?.context.probe === countedLeaf;
    },
  );

  await (router as never as {
    navigate: (n: string, p: unknown) => Promise<St>;
  }).navigate("u", { id: "2" });

  const prev = (router as never as { getPreviousState: () => St }).getPreviousState();

  seen.getPreviousState_leaf = prev.context.probe === countedLeaf;
  seen.afterNav_getStateLeaf =
    (router as never as { getState: () => St }).getState().context.probe ===
    countedLeaf;
  seen.coreReadsOfValue = valueReads.n; // P1/P2 по листу: ядро в него не смотрит
  out.B1 = seen;

  // ---- B2 ЭКСПЕРИМЕНТ (а) НА ЛИСТЕ: мелкая копия значения на границе.
  const copied = { ...(leaf as unknown as object) } as Record<string, unknown>;

  out.B2_shallowCopyOfMap_size = Object.keys(copied).length;
  out.B2_originalMap_size = leaf.size;
  out.B2_deferPayloadCopyLosesFreeze = (() => {
    const p = defer({ critical: 1, deferred: { a: Promise.resolve(1) } });
    const c = { ...(p as unknown as object) } as Record<string | symbol, unknown>;

    return {
      originalFrozen: Object.isFrozen(p),
      copyFrozen: Object.isFrozen(c),
      brandCopied: c[DEFER_BRAND] === true,
    };
  })();
}

function sectionC(): void {
  // ---- C contextClaimRecords: контейнер ЯДРА; чужая запись блокирует namespace,
  //      но её поля не читаются; счёт чтений Map на write/release.
  const router = mk();
  const api = getPluginApi(router);
  const ctx = getInternals(router) as unknown as Ctx;

  // ПОЗИТИВНЫЙ КОНТРОЛЬ: легальный клейм работает.
  const legal = api.claimContextNamespace("legal");
  const t: Ctx = {};

  legal.write({ context: t } as never, 1);
  out.C_control_legalWrite = Object.hasOwn(t, "legal");

  // Чужая запись, положенная приложением напрямую в Map ядра.
  const fieldReads: string[] = [];
  const foreignRecord = new Proxy(
    { write: () => undefined, release: () => undefined },
    {
      get(target, key, r) {
        fieldReads.push(String(key));

        return Reflect.get(target, key, r);
      },
    },
  );

  (ctx.contextClaimRecords as Map<string, unknown>).set("stolen", foreignRecord);

  let blocked = "";

  try {
    api.claimContextNamespace("stolen");
  } catch (error) {
    blocked = (error as { code?: string }).code ?? String(error);
  }

  out.C_secondClaimBlocked = blocked;
  out.C_foreignRecordFieldReads = fieldReads.length;

  // Счёт обращений ядра к самому Map на одну запись клейма.
  const real = ctx.contextClaimRecords as Map<string, unknown>;
  const mapOps: string[] = [];
  const spy = new Proxy(real, {
    get(target, key, r) {
      if (typeof key === "string") {
        mapOps.push(key);
      }

      const v = Reflect.get(target, key, r) as unknown;

      return typeof v === "function" ? (v as () => unknown).bind(target) : v;
    },
  });
  let installed = false;

  try {
    (ctx as Ctx).contextClaimRecords = spy;
    installed = (ctx.contextClaimRecords as unknown) === spy;
  } catch {
    installed = false;
  }

  if (installed) {
    mapOps.length = 0;
    legal.write({ context: {} } as never, 2);
    out.C_mapOpsPerWrite = [...mapOps];
    mapOps.length = 0;
    legal.release();
    out.C_mapOpsPerRelease = [...mapOps];
    (ctx as Ctx).contextClaimRecords = real;
  }

  out.C_spyInstalled = installed;
}

async function sectionD(): Promise<void> {
  // ---- D1 ПОЗИТИВНЫЙ КОНТРОЛЬ: честный defer()-payload — ключи описывают контейнер.
  {
    const router = mk();
    const deferredBag = { a: Promise.resolve(1) };

    (router as never as { usePlugin: (f: unknown) => unknown }).usePlugin(
      createSsrLoaderPlugin(
        { u: () => () => defer({ critical: { c: 1 }, deferred: deferredBag }) },
        ssrCfg,
      ) as never,
    );

    const st = await (router as never as {
      start: (p: string) => Promise<St>;
    }).start("/u/1");

    out.D1_control_keys = st.context.ssrDataDeferredKeys;
    out.D1_control_containerKeys = Object.keys(
      st.context.ssrDataDeferred as object,
    );
    out.D1_control_userBagFrozen = Object.isFrozen(deferredBag);
  }

  // ---- D2 ДРЕЙФУЮЩИЙ payload: `value.deferred` читается ДВАЖДЫ —
  //      ключи считаются с первого чтения, в контекст уезжает второе.
  {
    const router = mk();
    const first = { a: Promise.resolve(1) };
    const second = { b: Promise.resolve(2) };
    const reads = { deferred: 0, critical: 0, brand: 0 };
    const criticalLeaf = { c: 1 };
    const hostile: Record<string, unknown> = {};

    Object.defineProperty(hostile, DEFER_BRAND, {
      configurable: true,
      enumerable: true,
      get() {
        reads.brand += 1;

        return true;
      },
    });
    Object.defineProperty(hostile, "critical", {
      configurable: true,
      enumerable: true,
      get() {
        reads.critical += 1;

        return criticalLeaf;
      },
    });
    Object.defineProperty(hostile, "deferred", {
      configurable: true,
      enumerable: true,
      get() {
        reads.deferred += 1;

        return reads.deferred === 1 ? first : second;
      },
    });

    (router as never as { usePlugin: (f: unknown) => unknown }).usePlugin(
      createSsrLoaderPlugin({ u: () => () => hostile }, ssrCfg) as never,
    );

    const st = await (router as never as {
      start: (p: string) => Promise<St>;
    }).start("/u/1");

    out.D2_reads = { ...reads };
    out.D2_keysWritten = st.context.ssrDataDeferredKeys;
    out.D2_containerWritten_ownKeys = Object.keys(
      st.context.ssrDataDeferred as object,
    );
    out.D2_containerIsSecondRead = st.context.ssrDataDeferred === second;
    out.D2_criticalByReference = st.context.data === criticalLeaf;
    out.D2_keysDescribeContainer =
      JSON.stringify(st.context.ssrDataDeferredKeys) ===
      JSON.stringify(Object.keys(st.context.ssrDataDeferred as object));
    out.D2_payloadFrozen = Object.isFrozen(hostile);
    out.D2_secondBagFrozen = Object.isFrozen(second);
  }

  // ---- D3 P2: лгущий Proxy на `deferred` (ownKeys молчит, gOPD говорит «собственный»).
  {
    const router = mk();
    const hidden = { h: Promise.resolve(1) };
    const lying = new Proxy(hidden as unknown as Record<string, unknown>, {
      ownKeys: () => [],
      getOwnPropertyDescriptor: (t, k) =>
        k === "h"
          ? { configurable: true, enumerable: true, value: (t as Record<string, unknown>).h, writable: true }
          : Reflect.getOwnPropertyDescriptor(t, k),
    });
    const payload = {
      [DEFER_BRAND]: true,
      critical: 1,
      deferred: lying,
    } as unknown;

    (router as never as { usePlugin: (f: unknown) => unknown }).usePlugin(
      createSsrLoaderPlugin({ u: () => () => payload }, ssrCfg) as never,
    );

    const st = await (router as never as {
      start: (p: string) => Promise<St>;
    }).start("/u/1");

    out.D3_keysFromLyingProxy = st.context.ssrDataDeferredKeys;
    out.D3_containerIsProxy = st.context.ssrDataDeferred === lying;
    out.D3_control_hiddenKeyStillReadable =
      (st.context.ssrDataDeferred as Record<string, unknown>).h === hidden.h;
  }
}

function sectionE(): void {
  // ---- E defer·options.deferred / ·options.critical.
  // E1 ЭКСПЕРИМЕНТ (а): оригинал против предварительно скопированного контейнера.
  const promise = Promise.resolve(1);
  const criticalLeaf = { c: 1 };
  const original = { p: promise };
  const preCopied = { ...original };
  const a = defer({ critical: criticalLeaf, deferred: original });
  const b = defer({ critical: criticalLeaf, deferred: preCopied });

  out.E1_sameKeys =
    JSON.stringify(Object.keys(a.deferred)) ===
    JSON.stringify(Object.keys(b.deferred));
  out.E1_samePromiseIdentity =
    a.deferred.p === promise && b.deferred.p === promise;
  out.E1_bothSnapshotsFrozen =
    Object.isFrozen(a.deferred) && Object.isFrozen(b.deferred);
  out.E1_neitherIsCallerMap =
    (a.deferred as unknown) !== original && (b.deferred as unknown) !== preCopied;
  out.E1_criticalByReference = a.critical === criticalLeaf && b.critical === criticalLeaf;

  // E2 P1: счёт чтений options и мешка deferred.
  const deferredCounted = countingBag({ p: Promise.resolve(1), q: Promise.resolve(2) });
  const optionsCounted = countingBag({ critical: criticalLeaf, deferred: deferredCounted.bag });

  defer(optionsCounted.bag as never);
  out.E2_optionsReads = { ...optionsCounted.reads };
  out.E2_deferredReads = { ...deferredCounted.reads };

  // E3 P2: лгущий Proxy на options.deferred.
  const hiddenP = Promise.resolve(1);
  const lying = new Proxy({ p: hiddenP } as Record<string, unknown>, {
    ownKeys: () => [],
    getOwnPropertyDescriptor: (t, k) =>
      k === "p"
        ? { configurable: true, enumerable: true, value: hiddenP, writable: true }
        : Reflect.getOwnPropertyDescriptor(t, k),
  });
  const lyingOut = defer({ critical: 1, deferred: lying as never });

  out.E3_lyingProxy_snapshotKeys = Object.keys(lyingOut.deferred);
  out.E3_control_honestProxyKeys = Object.keys(
    defer({
      critical: 1,
      deferred: new Proxy({ p: hiddenP } as Record<string, unknown>, {}) as never,
    }).deferred,
  );

  // E4 P3: собственный "__proto__" из JSON.parse и унаследованный аксессор.
  const parsed = JSON.parse('{"__proto__": {"polluted": true}}') as Record<
    string,
    unknown
  >;

  out.E4_parsedHasOwnProto = Object.hasOwn(parsed, "__proto__");

  let protoThrew = "";

  try {
    defer({ critical: 1, deferred: parsed as never });
  } catch (error) {
    protoThrew = String(error);
  }

  out.E4_protoKeyRefused = protoThrew;
  out.E4_ObjectPrototypeClean =
    (Object.prototype as unknown as Ctx).polluted === undefined;

  let inheritedThrew = "";
  let inheritedKeys: string[] = [];

  Object.defineProperty(Object.prototype, "inheritedP", {
    configurable: true,
    enumerable: true,
    get: () => Promise.resolve(1),
    set: () => undefined,
  });

  try {
    inheritedKeys = Object.keys(
      defer({ critical: 1, deferred: {} as never }).deferred,
    );
  } catch (error) {
    inheritedThrew = String(error);
  } finally {
    delete (Object.prototype as unknown as Ctx).inheritedP;
  }

  out.E4_inheritedKeyIgnored = inheritedKeys;
  out.E4_inheritedThrew = inheritedThrew;

  // E5 P4: заморожен уровень ядра, не глубже.
  const userMap = { p: Promise.resolve(1) };
  const crit = { deep: { x: 1 } };
  const payload = defer({ critical: crit, deferred: userMap });

  out.E5_payloadFrozen = Object.isFrozen(payload);
  out.E5_snapshotFrozen = Object.isFrozen(payload.deferred);
  out.E5_userMapFrozen = Object.isFrozen(userMap);
  out.E5_criticalFrozen = Object.isFrozen(crit);
  out.E5_criticalDeepFrozen = Object.isFrozen(crit.deep);
  out.E5_promiseFrozen = Object.isFrozen(userMap.p);
}

async function main(): Promise<void> {
  await sectionA();
  await sectionB();
  sectionC();
  await sectionD();
  sectionE();

  for (const [k, v] of Object.entries(out)) {
    console.log(k, JSON.stringify(v));
  }
}

main().catch((error: unknown) => {
  console.error("PROBE FAILED", error);
  process.exitCode = 1;
});
