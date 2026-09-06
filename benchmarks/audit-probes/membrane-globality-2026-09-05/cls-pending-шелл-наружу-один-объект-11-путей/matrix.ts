// Матрица семейства «PENDING-шелл наружу · один объект × 11 путей».
// Строки — двери (6 по оси ШЕЛЛ, 5 по оси .context), столбцы — (а), P1..P4.
// Эксперимент (а) и P1..P4 ставятся ОДИН раз на объект (шелл / его context),
// по каждому пути проверяется только идентичность и уровень заморозки.
//
// Run: cd W/benchmarks && NODE_OPTIONS='--conditions=@real-router/internal-source' \
//   npx tsx audit-probes/membrane-globality-2026-09-05/cls-pending-шелл-наружу-один-объект-11-путей/matrix.ts
import { createRouter, events } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

import type { Router, State } from "@real-router/core/types";

type Shell = Record<string, unknown> & State;
type Bag = Record<string, unknown>;

const PATHS = [
  "Plugin.onTransitionStart·toState",
  "Plugin.onTransitionLeaveApprove·toState",
  "PluginApi.addEventListener·$$start·toState",
  "PluginApi.addEventListener·$$leaveApprove·toState",
  "LeaveState.nextRoute",
  "GuardFn·toState",
] as const;

type PathId = (typeof PATHS)[number];

interface Rig {
  router: Router;
  seen: Record<string, unknown>;
  arm: () => void;
}

function mk(hooks: Partial<Record<string, (s: Shell) => void>>): Rig {
  const seen: Record<string, unknown> = {};
  let armed = false;
  const fire = (label: string, state: unknown): void => {
    if (!armed) {
      return;
    }

    seen[label] ??= state;
    hooks[label]?.(state as Shell);
  };

  const router = createRouter(
    [
      { name: "home", path: "/home" },
      {
        name: "g",
        path: "/g/:id?tab",
        canActivate: () => (toState: unknown) => {
          fire("GuardFn·toState", toState);

          return true;
        },
      },
      { name: "other", path: "/other" },
    ] as never,
    {} as never,
  );
  const api = getPluginApi(router);

  router.usePlugin(() => ({
    onTransitionStart: (s: unknown) => {
      fire("Plugin.onTransitionStart·toState", s);
    },
    onTransitionLeaveApprove: (s: unknown) => {
      fire("Plugin.onTransitionLeaveApprove·toState", s);
    },
  }));
  api.addEventListener(events.TRANSITION_START, (s) => {
    fire("PluginApi.addEventListener·$$start·toState", s);
  });
  api.addEventListener(events.TRANSITION_LEAVE_APPROVE, (s) => {
    fire("PluginApi.addEventListener·$$leaveApprove·toState", s);
  });
  router.subscribeLeave(({ nextRoute }) => {
    fire("LeaveState.nextRoute", nextRoute);
  });

  return {
    router,
    seen,
    arm: () => {
      armed = true;
    },
  };
}

const out: Record<string, unknown> = {};

// ─────────────────────────────────────────────────────────── A. ПУТИ
async function sectionA(): Promise<void> {
  const rig = mk({});

  await rig.router.start("/home");
  rig.arm();
  await rig.router.navigate("g", { id: "2" } as never);
  const committed = rig.router.getState()!;
  const rows: Record<string, unknown> = {};

  for (const p of PATHS) {
    const shell = rig.seen[p] as Shell | undefined;

    rows[p] =
      shell === undefined
        ? "NOT FIRED"
        : {
            shellIsCommitted: shell === committed,
            contextIsCommittedContext: shell.context === committed.context,
            paramsIsCommittedParams: shell.params === committed.params,
          };
  }

  out.A_paths_one_object = {
    ...rows,
    "control · getState() === getState()": rig.router.getState() === committed,
    "control · fromState handout is NOT the committed shell":
      (rig.seen["LeaveState.route"] ?? null) !== committed,
    "control · distinct objects compare false": ({} as unknown) === ({} as unknown),
  };
  rig.router.dispose();
}

// ──────────────────────────────────────────── B. ЭКСПЕРИМЕНТ (а)
// (а) на оси ШЕЛЛ: приложению отдаётся мелкая копия шелла, листья (context,
// params) — те же ссылки. (а) на оси .context в ДВУХ позициях: копия на
// ВЫХОДЕ (приложение получает копию контейнера) и копия на ВОЗВРАТЕ (ядро
// копирует контейнер один раз, забирая его к себе — что systemCommit уже
// делает на арке replace()).
async function sectionB(): Promise<void> {
  type Mode = "handle" | "shellCopySharedLeaves" | "contextCopyAtExit";
  const one = async (mode: Mode, where: PathId): Promise<Record<string, unknown>> => {
    const router = createRouter(
      [
        { name: "home", path: "/home" },
        { name: "g", path: "/g/:id", canActivate: () => () => true },
      ] as never,
      {} as never,
    );
    const api = getPluginApi(router);
    const claim = api.claimContextNamespace("probe");
    const payload = { mode, where };
    const write = (s: State): void => {
      const target =
        mode === "handle"
          ? s
          : mode === "shellCopySharedLeaves"
            ? ({ ...s } as State)
            : ({ ...s, context: { ...s.context } } as State);

      claim.write(target, payload);
    };
    let ran = false;

    if (where === "LeaveState.nextRoute") {
      router.subscribeLeave(({ nextRoute }) => {
        ran = true;
        write(nextRoute);
      });
    } else {
      router.usePlugin(() => ({
        onTransitionStart: (s: State) => {
          ran = true;
          write(s);
        },
      }));
    }

    await router.start("/home");
    await router.navigate("g", { id: "1" } as never);
    const ctx = router.getState()!.context as Bag;
    const r = {
      writerRan: ran,
      committedCarriesTheWrite: ctx.probe === payload,
      committedContextKeys: Object.keys(ctx),
    };

    router.dispose();

    return r;
  };

  const b: Record<string, unknown> = {};

  for (const where of ["Plugin.onTransitionStart·toState", "LeaveState.nextRoute"] as const) {
    for (const mode of ["handle", "shellCopySharedLeaves", "contextCopyAtExit"] as const) {
      b[`${where} · ${mode}`] = await one(mode, where);
    }
  }

  // (а) на ВОЗВРАТЕ: ядро уже умеет это на арке replace() — systemCommit
  // делает `context: { ...toState.context }`. Пишем из ХУКА pending-состояния,
  // затем гоняем replace() и смотрим, пережила ли запись копирование.
  {
    const router = createRouter(
      [
        { name: "home", path: "/home" },
        { name: "g", path: "/g/:id" },
      ] as never,
      {} as never,
    );
    const api = getPluginApi(router);
    const claim = api.claimContextNamespace("probe");
    const payload = { via: "pending hook" };

    router.usePlugin(() => ({
      onTransitionStart: (s: State) => {
        claim.write(s, payload);
      },
    }));
    await router.start("/home");
    await router.navigate("g", { id: "1" } as never);
    const pendingCtx = router.getState()!.context as Bag;

    getRoutesApi(router).replace([
      { name: "home", path: "/home" },
      { name: "g", path: "/g/:id" },
    ] as never);
    const afterCtx = router.getState()!.context as Bag;

    b["(а) at RE-ENTRY · replace()/systemCommit spread"] = {
      newContainer: afterCtx !== pendingCtx,
      writeSurvivedTheCopy: afterCtx.probe === payload,
      keys: Object.keys(afterCtx),
    };
    router.dispose();
  }

  out.B_strategy_a = b;
}

// ─────────────────────────────────────────────────────────── C. P1
// Дрейфующий геттер на КАЖДОМ собственном ключе pending-шелла: сколько раз
// ядро читает ключ между хэндаутом и коммитом, и от какого чтения зависит
// наблюдаемый результат.
async function sectionC(): Promise<void> {
  const KEYS = ["name", "params", "search", "path", "context", "transition"] as const;
  const rows: Record<string, unknown> = {};

  for (const key of KEYS) {
    let reads = 0;
    let setterHits = 0;
    let first: unknown;
    const drift: Record<string, unknown> = {
      name: "other",
      params: { id: "999" },
      search: { tab: "drift" },
      path: "/drifted",
      context: { drifted: true },
      transition: undefined,
    };
    const rig = mk({
      "Plugin.onTransitionStart·toState": (s) => {
        first = s[key];
        Object.defineProperty(s, key, {
          configurable: true,
          enumerable: true,
          get(): unknown {
            reads++;

            return reads === 1 ? first : drift[key];
          },
          set(v: unknown): void {
            setterHits++;
            first = v;
          },
        });
      },
    });

    await rig.router.start("/home");
    rig.arm();

    let nav: string;

    try {
      await rig.router.navigate("g", { id: "2" } as never);
      nav = "resolved";
    } catch (error) {
      nav = `rejected:${(error as { code?: string }).code ?? (error as Error).name}`;
    }

    const readsAtCommit = reads;
    const st = rig.router.getState() as Shell | undefined;

    rows[key] = {
      nav,
      readsBetweenHandoutAndCommit: readsAtCommit,
      P1: readsAtCommit <= 1 ? "держится" : "нарушено",
      coreWroteThroughTheSetter: setterHits,
      committedIsTheShell: st === rig.seen["Plugin.onTransitionStart·toState"],
      committedName: st?.name,
      committedPath: st?.path,
    };
    rig.router.dispose();
  }

  // Позитивный контроль инструмента: тот же счётчик на постороннем литерале.
  let n = 0;
  const lit = {};

  Object.defineProperty(lit, "k", {
    configurable: true,
    enumerable: true,
    get(): number {
      n++;

      return 1;
    },
  });
  void (lit as { k: number }).k;

  out.C_P1_shell_per_key = {
    ...rows,
    "control · counter on a plain literal, one read": n,
  };
}

// ─────────────────────────────────────────────────────────── D. P2
// Лгущий Proxy, поставленный ПРИЛОЖЕНИЕМ в слот `context` pending-шелла
// (слот принимает запись — B-матрица первой волны: contextSlot LANDED=true).
// ownKeys прячет "hidden", getOwnPropertyDescriptor утверждает, что он
// собственный и перечислимый. Вопрос: попадает ли "hidden" в НОВЫЙ контейнер
// ядра на арке read-back (systemCommit `{ ...toState.context }`).
async function sectionD(): Promise<void> {
  const traps: Record<string, number> = { ownKeys: 0, getOwnPropertyDescriptor: 0, get: 0, has: 0 };
  const source: Bag = { visible: 1, hidden: 2 };
  const lying = new Proxy(source, {
    ownKeys(t) {
      traps.ownKeys++;

      return Reflect.ownKeys(t).filter((k) => k !== "hidden");
    },
    getOwnPropertyDescriptor(t, k) {
      traps.getOwnPropertyDescriptor++;

      return { configurable: true, enumerable: true, writable: true, value: Reflect.get(t, k) };
    },
    get(t, k, r) {
      traps.get++;

      return Reflect.get(t, k, r);
    },
    has(t, k) {
      traps.has++;

      return Reflect.has(t, k);
    },
  });
  const rig = mk({
    "Plugin.onTransitionStart·toState": (s) => {
      s.context = lying as never;
    },
  });

  await rig.router.start("/home");
  rig.arm();
  await rig.router.navigate("g", { id: "2" } as never);
  const committedIsProxy = rig.router.getState()!.context === (lying as unknown);
  const trapsAtCommit = { ...traps };

  getRoutesApi(rig.router).replace([
    { name: "home", path: "/home" },
    { name: "g", path: "/g/:id?tab", canActivate: () => () => true },
    { name: "other", path: "/other" },
  ] as never);
  const after = rig.router.getState()!.context as Bag;

  out.D_P2_lying_proxy_as_pending_context = {
    committedContextIsTheLyingProxy: committedIsProxy,
    trapsDuringCommit: trapsAtCommit,
    trapsAfterReplaceReadBack: { ...traps },
    "hasOwn/in asked about a key core did not get from ownKeys": traps.has,
    copiedKeys: Object.keys(after),
    "hidden key crossed into core's new container": Object.hasOwn(after, "hidden"),
    P2: traps.has === 0 && !Object.hasOwn(after, "hidden") ? "держится" : "нарушено",
    "control · a truthful proxy carries the key": (() => {
      const t: Bag = { visible: 1, hidden: 2 };

      return Object.keys({ ...t }).includes("hidden");
    })(),
  };
  rig.router.dispose();
}

// ─────────────────────────────────────────────────────────── E. P3
// E1 — унаследованный сеттер под именем слота, который ядро ПИШЕТ в шелл
//      (`transition` в completeTransition). #1852-форма на собственной записи ядра.
// E2 — унаследованный аксессор на Object.prototype под именем namespace во
//      время claim.write (ось .context; putField должен определять, а не писать).
// E3 — собственный ключ "__proto__" из JSON.parse в pending-context, затем
//      арка read-back: подменяет ли он прототип копии ядра.
async function sectionE(): Promise<void> {
  const e: Record<string, unknown> = {};

  {
    let captured: unknown;
    const fake = { phase: "fake" };
    const rig = mk({
      "Plugin.onTransitionStart·toState": (s) => {
        delete (s as Bag).transition;
        Object.setPrototypeOf(s, {
          set transition(v: unknown) {
            captured = v;
          },
          get transition(): unknown {
            return fake;
          },
        });
      },
    });

    await rig.router.start("/home");
    rig.arm();
    await rig.router.navigate("g", { id: "2" } as never);
    const st = rig.router.getState()!;

    e.E1_inherited_setter_under_transition = {
      committedHasOwnTransition: Object.hasOwn(st, "transition"),
      coresRealMetaWentToTheAppSetter:
        captured !== undefined && (captured as { phase?: string }).phase === "activating",
      committedTransitionIsTheAppFake: st.transition === (fake as unknown),
      committedPrototypeIsAppChosen: Object.getPrototypeOf(st) !== Object.prototype,
      P3: Object.hasOwn(st, "transition") ? "держится" : "нарушено",
    };
    rig.router.dispose();
  }

  {
    const NS = "probeNs";
    let inheritedSetterHits = 0;
    let plainAssignHits = 0;

    Object.defineProperty(Object.prototype, NS, {
      configurable: true,
      set(this: Bag, v: unknown): void {
        inheritedSetterHits++;
        plainAssignHits++;
        void v;
      },
      get(): unknown {
        return undefined;
      },
    });

    try {
      const router = createRouter(
        [
          { name: "home", path: "/home" },
          { name: "g", path: "/g/:id" },
        ] as never,
        {} as never,
      );
      const api = getPluginApi(router);
      const claim = api.claimContextNamespace(NS);
      const payload = { p: 1 };

      router.usePlugin(() => ({
        onTransitionStart: (s: State) => {
          claim.write(s, payload);
        },
      }));
      await router.start("/home");
      await router.navigate("g", { id: "1" } as never);
      const ctx = router.getState()!.context as Bag;
      const viaClaim = inheritedSetterHits;

      // Позитивный контроль: обычное присваивание тем же именем ДОХОДИТ до
      // унаследованного сеттера — значит ловушка стояла и была достижима.
      plainAssignHits = 0;

      const bare: Bag = {};

      bare[NS] = payload;

      e.E2_inherited_setter_under_claim_namespace = {
        claimWriteHitTheInheritedSetter: viaClaim,
        committedContextHasOwnKey: Object.hasOwn(ctx, NS),
        committedValueIsThePayload: Object.getOwnPropertyDescriptor(ctx, NS)?.value === payload,
        "control · plain assignment DOES hit the inherited setter": plainAssignHits,
        "control · plain assignment left no own key": Object.hasOwn(bare, NS),
        P3: viaClaim === 0 && Object.hasOwn(ctx, NS) ? "держится" : "нарушено",
      };
      router.dispose();
    } finally {
      delete (Object.prototype as Bag)[NS];
    }
  }

  {
    const rig = mk({
      "Plugin.onTransitionStart·toState": (s) => {
        const parsed = JSON.parse('{"__proto__":{"polluted":true},"ok":1}') as Bag;
        const ctx = s.context as Bag;

        for (const k of Object.keys(parsed)) {
          Object.defineProperty(ctx, k, {
            configurable: true,
            enumerable: true,
            writable: true,
            value: parsed[k],
          });
        }
      },
    });

    await rig.router.start("/home");
    rig.arm();
    await rig.router.navigate("g", { id: "2" } as never);
    const pending = rig.router.getState()!.context as Bag;

    getRoutesApi(rig.router).replace([
      { name: "home", path: "/home" },
      { name: "g", path: "/g/:id?tab", canActivate: () => () => true },
      { name: "other", path: "/other" },
    ] as never);
    const copy = rig.router.getState()!.context as Bag;

    e.E3_own___proto___through_read_back = {
      pendingHadOwnProtoKey: Object.hasOwn(pending, "__proto__"),
      copyIsANewContainer: copy !== pending,
      copyHasOwnProtoKey: Object.hasOwn(copy, "__proto__"),
      copyPrototypeUntouched: Object.getPrototypeOf(copy) === Object.prototype,
      "'polluted' visible on a bare literal": "polluted" in {},
      P3:
        Object.getPrototypeOf(copy) === Object.prototype && !("polluted" in {})
          ? "держится"
          : "нарушено",
    };
    rig.router.dispose();
  }

  out.E_P3 = e;
}

// ─────────────────────────────────────────────────────────── F. P4
async function sectionF(): Promise<void> {
  const appNested = { deep: { deeper: 1 } };
  const appParams: Bag = { id: "2", nested: appNested };
  const rig = mk({
    "Plugin.onTransitionStart·toState": (s) => {
      (s.context as Bag).appLeaf = appNested;
      s.params = appParams as never;
    },
  });

  await rig.router.start("/home");
  rig.arm();
  await rig.router.navigate("g", { id: "2" } as never);
  const st = rig.router.getState()!;

  // Отдельный прогон без подмены params — ядро само породило params в
  // materialize и заморозило их там.
  const clean = mk({});

  await clean.router.start("/home");
  clean.arm();
  await clean.router.navigate("g", { id: "2" } as never);
  const cleanSt = clean.router.getState()!;

  out.F_P4_freeze_levels = {
    "core's own level (shell) frozen": Object.isFrozen(st),
    "core's own params (no substitution) frozen": Object.isFrozen(cleanSt.params),
    "core's own search (no substitution) frozen": Object.isFrozen(cleanSt.search),
    "core's context container frozen": Object.isFrozen(st.context),
    "app's substituted params bag frozen": Object.isFrozen(st.params),
    "app's nested leaf inside context frozen": Object.isFrozen(appNested),
    "app's nested leaf, one level deeper, frozen": Object.isFrozen(appNested.deep),
    "control · an untouched literal is not frozen": Object.isFrozen({}),
    P4:
      Object.isFrozen(st) &&
      !Object.isFrozen(appNested) &&
      !Object.isFrozen(st.params) &&
      Object.isFrozen(cleanSt.params)
        ? "держится"
        : "нарушено",
  };
  rig.router.dispose();
  clean.router.dispose();
}

async function main(): Promise<void> {
  await sectionA();
  await sectionB();
  await sectionC();
  await sectionD();
  await sectionE();
  await sectionF();
  console.log(JSON.stringify(out, null, 2));
}

void main();
