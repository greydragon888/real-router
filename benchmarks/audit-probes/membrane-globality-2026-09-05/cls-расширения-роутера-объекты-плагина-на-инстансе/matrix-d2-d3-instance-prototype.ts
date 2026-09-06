// D2 · Router·[key: string] и D3 · Router.prototype·[key: string]
// Матрица: эксперимент (а) + P1..P4. Общий объект — ЭКЗЕМПЛЯР/ПРОТОТИП ядра;
// объект приложения здесь — ЛИСТ (значение слота).
import { Router, createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

const ROUTES = [
  { name: "u", path: "/u/:id" },
  { name: "v", path: "/v" },
] as never;
const mk = (): any => createRouter(ROUTES, {} as never);
const out = (tag: string, o: unknown): void =>
  console.log(tag, JSON.stringify(o));

/** Полный жизненный цикл ядра — всё, что могло бы прочитать слот. */
async function lifecycle(r: any): Promise<void> {
  await r.start("/u/1");
  await r.navigate("v");
  r.buildPath("u", { id: "2" });
  r.isActiveRoute("v");
  r.canNavigateTo("u", { id: "3" });
  r.getState();
  getPluginApi(r).getOptions();
  getPluginApi(r).getTree();
  const c = cloneRouter(r);
  r.stop();
  r.dispose();
  c.dispose();
}

// ── D2-A · (а) неприменима как «копия контейнера»: контейнер = экземпляр ядра.
//    Показываем, что копия ЛИСТА ломает то, чего требует семя 2.
{
  const r = mk();
  const service = { calls: 0 };
  (r as any).appSlot = service; // прямая запись приложением

  // читатель (второй плагин) получает ТОТ ЖЕ router
  let seenSame: boolean | undefined;
  let seesWriterMutation: number | undefined;
  r.usePlugin((router: any) => {
    seenSame = router.appSlot === service;
    service.calls += 1;
    seesWriterMutation = router.appSlot.calls;

    return {};
  });

  // смоделированная (а): ядро скопировало бы лист
  const copied = { ...service };
  service.calls += 1;
  out("D2_A_experiment_a", {
    containerIsCoreOwn: true,
    leafIdentityHeld: seenSame,
    readerSeesWriterMutation: seesWriterMutation,
    simulatedLeafCopy_identity: copied === service,
    simulatedLeafCopy_seesMutation: copied.calls === service.calls,
    routerExtensionsUntouched:
      (getInternals(r) as any).routerExtensions.length === 0,
  });
}

// ── D2-P1/P2 · сколько раз ядро читает слот приложения за полный цикл ──────
{
  const r = mk();
  let coreReads = 0;
  let held: unknown = { svc: true };
  Object.defineProperty(r, "appSlot", {
    configurable: true,
    enumerable: true,
    get(): unknown {
      coreReads += 1;

      return held;
    },
    set(v: unknown): void {
      held = v;
    },
  });
  // второй слот — НЕперечислимый: если бы ядро перечисляло, счётчики разошлись
  let coreReadsHidden = 0;
  Object.defineProperty(r, "appHidden", {
    configurable: true,
    enumerable: false,
    get(): unknown {
      coreReadsHidden += 1;

      return 1;
    },
  });

  void lifecycle(r).then(() => {
    const afterLifecycle = coreReads;
    const afterHidden = coreReadsHidden;
    // позитивные контроли инструмента
    void (r as any).appSlot; // +1
    const controlAppRead = coreReads;
    const spread = { ...(r as any) }; // +1
    void spread;
    const controlSpread = coreReads;
    out("D2_P1_P2", {
      coreReadsOverLifecycle: afterLifecycle,
      coreReadsOfNonEnumerable: afterHidden,
      control_appRead: controlAppRead,
      control_spreadEnumeratesInstance: controlSpread,
      verdict_coreNeverReads: afterLifecycle === 0 && afterHidden === 0,
    });

    d2p3();
  });
}

// ── D2-P3 · запись выполняет ВЫЗЫВАЮЩИЙ; что делает "__proto__" и амбиентный сеттер
function d2p3(): void {
  const r = mk();
  const protoBefore = Object.getPrototypeOf(r);
  (r as any).__proto__ = { swapped: true };
  const protoSwapped = Object.getPrototypeOf(r) !== protoBefore;
  const ownProtoKeyCreated = Object.hasOwn(r, "__proto__");
  let stillWorks: string | undefined;

  try {
    stillWorks = r.buildPath("u", { id: "9" });
  } catch (e) {
    stillWorks = `THREW:${(e as Error).name}`;
  }

  // амбиентный сеттер под именем слота — прямая запись УЙДЁТ в него
  const r2 = mk();
  const NAME = "d2Ambient";
  let setterHits = 0;
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
    (r2 as any)[NAME] = "V";
  } finally {
    delete (Object.prototype as any)[NAME];
  }

  out("D2_P3", {
    protoSwappedByCallerWrite: protoSwapped,
    ownProtoKeyCreated,
    coreMethodsStillWork: stillWorks,
    ambientSetterHitsOnDirectWrite: setterHits,
    note: "запись делает вызывающий, не ядро",
  });

  d2p4();
}

// ── D2-P4 · экземпляр намеренно открыт ─────────────────────────────────────
function d2p4(): void {
  const r = mk();
  out("D2_P4", {
    routerIsFrozen: Object.isFrozen(r),
    routerIsExtensible: Object.isExtensible(r),
    reason: "extendRouter и #markDisposed пишут в экземпляр — заморозка их сломала бы",
  });

  d3();
}

// ── D3 · тот же тип на ПРОТОТИПЕ: радиус — процесс ─────────────────────────
function d3(): void {
  const NAME = "d3ProtoSlot";
  let coreReads = 0;
  const leaf = { shared: true };
  const r1 = mk();
  const r2 = mk();
  let seenByAll: boolean | undefined;
  let ownOnInstance: boolean | undefined;
  let conflict1: string | undefined;
  let conflict2: string | undefined;
  let protoFrozen: boolean | undefined;
  let controlAppRead = 0;
  let readsBeforeAppRead = -1;

  Object.defineProperty(Router.prototype, NAME, {
    configurable: true,
    enumerable: true,
    get(): unknown {
      coreReads += 1;

      return leaf;
    },
  });

  try {
    void r1.start("/u/1");
    r1.buildPath("u", { id: "2" });
    r1.isActiveRoute("u", { id: "2" });
    const c = cloneRouter(r1);
    readsBeforeAppRead = coreReads;
    seenByAll =
      (r1 as any)[NAME] === leaf &&
      (r2 as any)[NAME] === leaf &&
      (c as any)[NAME] === leaf;
    controlAppRead = coreReads; // три чтения приложением
    ownOnInstance = Object.hasOwn(r1, NAME);

    try {
      getPluginApi(r1).extendRouter({ [NAME]: 1 });
    } catch (e) {
      conflict1 = (e as any).code;
    }

    try {
      getPluginApi(r2).extendRouter({ [NAME]: 1 });
    } catch (e) {
      conflict2 = (e as any).code;
    }

    protoFrozen = Object.isFrozen(Router.prototype);
    r1.dispose();
    r2.dispose();
    c.dispose();
  } finally {
    delete (Router.prototype as any)[NAME];
  }

  out("D3", {
    coreReadsBeforeAppRead: readsBeforeAppRead,
    totalReads_allFromApp: coreReads,
    control_appReadCount: controlAppRead,
    seenByAllInstancesAndClone: seenByAll,
    ownOnInstance,
    blocksExtendRouterOnRouter1: conflict1,
    blocksExtendRouterOnRouter2: conflict2,
    prototypeIsFrozen: protoFrozen,
    prototypeIsExtensible: Object.isExtensible(Router.prototype),
  });
}
