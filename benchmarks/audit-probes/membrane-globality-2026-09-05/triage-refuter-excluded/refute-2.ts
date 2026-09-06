// Опровергатель, раунд 2: исправлены две ошибки формы из refute.ts —
// (1) поле payload'а TREE_CHANGED называется `added`, не `routes`
//     (types/tree-changed.ts · TreeChangedAdd), и контроль читался ПОСЛЕ
//     собственной записи пробы; (2) счётчик на getCloneState·return ловил
//     доступы САМОЙ пробы — теперь берётся базовая отметка перед вызовом ядра.
import { createRouter } from "@real-router/core";
import { getRoutesApi, cloneRouter } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

type AnyRec = Record<string, unknown>;
const out: AnyRec = {};

function countReads(obj: object): { n: number; keys: string[] } {
  const box = { n: 0, keys: [] as string[] };
  for (const k of Object.keys(obj)) {
    const d = Object.getOwnPropertyDescriptor(obj, k);
    if (!d || !d.configurable || d.get) continue;
    const v = d.value;
    Object.defineProperty(obj, k, {
      configurable: true,
      enumerable: d.enumerable,
      get() {
        box.n++;
        box.keys.push(k);
        return v;
      },
      set() {
        /* запись глотается — интересует только чтение ядром */
      },
    });
  }
  return box;
}

async function main(): Promise<void> {
  // ===== R4'. RoutesApi.subscribeChanges·event =============================
  {
    const router = createRouter(
      [{ name: "home", path: "/home" }] as never,
      { defaultRoute: "home" } as never,
    );
    const routes = getRoutesApi(router);
    const events: AnyRec[] = [];
    routes.subscribeChanges(((e: AnyRec) => {
      events.push(e);
    }) as never);

    const callerBag = { a: 1 };
    routes.add([
      { name: "q", path: "/q/:id", defaultParams: callerBag },
    ] as never);
    const ev = events[0];
    const control = {
      op: ev.op,
      addedLen: (ev.added as unknown[]).length,
      addedName: ((ev.added as AnyRec[])[0] as AnyRec).name,
    };
    const shell = (ev.added as AnyRec[])[0];
    const freezes = {
      envelopeFrozen: Object.isFrozen(ev),
      addedArrayFrozen: Object.isFrozen(ev.added),
      addedShellFrozen: Object.isFrozen(shell),
      interiorIsCallersBag: shell.defaultParams === (callerBag as unknown),
      interiorFrozen: Object.isFrozen(shell.defaultParams),
    };
    // (i) читает ли ядро САМ конверт обратно после доставки?
    const boxEnv = countReads(ev);
    routes.add([{ name: "z", path: "/z" }] as never);
    routes.update("q", { path: "/q2/:id" } as never);
    routes.remove("z");
    await router.start("/home");
    await router.navigate("q", { id: "1" } as never);
    const envelopeReadBackByCore = boxEnv.n;
    // (ii) наблюдаемость ЧУЖИХ дверей: запись в интерьер конверта
    (shell.defaultParams as AnyRec).id = "POISONED";
    const built = router.buildPath("q", {} as never);
    out.R4 = {
      control_event: control,
      ...freezes,
      envelopeReadBackByCore,
      envelopeKeysCoreRead: [...new Set(boxEnv.keys)],
      interiorWriteReachesRouter_buildPath: built,
    };
  }

  // ===== R6'. getCloneState·return — базовая отметка перед вызовом ядра ======
  {
    const router = createRouter(
      [{ name: "home", path: "/home" }] as never,
      { defaultRoute: "home" } as never,
      { svc: { n: 1 } } as never,
    );
    const ctx = getInternals(router) as unknown as AnyRec;
    const cs = (ctx.getCloneState as () => AnyRec)();
    const control = Object.keys(cs);
    const opts = cs.options as object;
    const deps = cs.dependencies as object;
    const log = cs.loggerConfig as object;
    const boxTop = countReads(cs);
    const boxOpts = countReads(opts);
    const boxDeps = countReads(deps);
    const boxLog = countReads(log);
    const baseTop = boxTop.n; // = 0: getCloneState уже вернул объект
    // ЕДИНСТВЕННЫЙ потребитель этого объекта в ядре
    const clone = cloneRouter(router as never, { extra: 1 } as never);
    await router.start("/home");
    const cs2 = (ctx.getCloneState as () => AnyRec)();
    out.R6 = {
      control_cloneStateKeys: control,
      control_cloneBuilt: typeof (clone as unknown as AnyRec).navigate,
      baselineBeforeCoreCall: baseTop,
      readsOfHandedOutContainerByCore: boxTop.n - baseTop,
      readsOfHandedOutOptionsByCore: boxOpts.n,
      readsOfHandedOutDependenciesByCore: boxDeps.n,
      readsOfHandedOutLoggerConfigByCore: boxLog.n,
      keysCoreRead: [
        ...new Set([
          ...boxTop.keys,
          ...boxOpts.keys,
          ...boxDeps.keys,
          ...boxLog.keys,
        ]),
      ],
      freshContainerPerCall: cs !== cs2,
    };
  }

  console.log(JSON.stringify(out, null, 1));
}

void main();
