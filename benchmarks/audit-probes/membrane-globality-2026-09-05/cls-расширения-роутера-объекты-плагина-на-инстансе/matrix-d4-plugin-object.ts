// D4 · Router.usePlugin·PluginFactory·return — матрица: эксперимент (а) + P1..P4.
import { createRouter } from "@real-router/core";
import { getInternals } from "@real-router/core/validation";

const ROUTES = [
  { name: "u", path: "/u/:id" },
  { name: "v", path: "/v" },
] as never;
const mk = (): any => createRouter(ROUTES, {} as never);
const out = (tag: string, o: unknown): void =>
  console.log(tag, JSON.stringify(o));

const HOOKS = [
  "onStart",
  "onStop",
  "onTransitionStart",
  "onTransitionLeaveApprove",
  "onTransitionCancel",
  "onTransitionError",
  "onTransitionSuccess",
] as const;

/** Враждебный объект плагина: геттеры-счётчики + унаследованный хук + вложенный контейнер. */
function hostilePlugin(fired: string[]): {
  obj: any;
  reads: Record<string, number>;
  nested: { deep: number };
  proto: any;
} {
  const reads: Record<string, number> = {};
  const nested = { deep: 1 };
  // onStop живёт на ПРОТОТИПЕ — собственных ключей у объекта под него нет
  const proto = {
    onStop(): void {
      fired.push("onStop(inherited)");
    },
  };
  const obj: any = Object.create(proto);

  for (const name of ["onStart", "onTransitionSuccess"] as const) {
    Object.defineProperty(obj, name, {
      configurable: true,
      enumerable: true,
      get(): unknown {
        reads[name] = (reads[name] ?? 0) + 1;

        return () => fired.push(name);
      },
    });
  }
  Object.defineProperty(obj, "teardown", {
    configurable: true,
    enumerable: true,
    get(): unknown {
      reads.teardown = (reads.teardown ?? 0) + 1;

      return () => fired.push("teardown");
    },
  });
  obj.config = nested;

  return { obj, reads, nested, proto };
}

async function main(): Promise<void> {
  // ── A · ЭКСПЕРИМЕНТ (а): оригинал против контейнера, СКОПИРОВАННОГО на границе
  {
    const run = async (
      label: string,
      wrap: (o: any) => any,
    ): Promise<unknown> => {
      const fired: string[] = [];
      const r = mk();
      const h = hostilePlugin(fired);
      const factory = (): any => wrap(h.obj);
      const unsub = r.usePlugin(factory);
      await r.start("/u/1");
      await r.navigate("v");
      const ctx = getInternals(r) as any;
      const cs = ctx.getCloneState();
      const handedBackIsFactory =
        cs.pluginFactories.includes(factory) && !cs.pluginFactories.includes(h.obj);
      r.stop();
      unsub();
      r.dispose();

      return {
        label,
        fired: [...fired],
        readsOfCallersObject: { ...h.reads },
        callersObjectFrozen: Object.isFrozen(h.obj),
        callersNestedFrozen: Object.isFrozen(h.nested),
        callersPrototypeFrozen: Object.isFrozen(h.proto),
        handedBackIsFactory,
      };
    };

    const orig = await run("ORIGINAL (ручка)", (o) => o);
    // эмуляция (а): контейнер копируется ОДИН раз на границе, листья — те же
    const copied = await run("PRE-COPIED (а)", (o) => {
      const rec: any = {};

      for (const name of [...HOOKS, "teardown"] as const) {
        if (name in o) {
          rec[name] = o[name];
        }
      }

      return rec;
    });
    out("D4_A_experiment_a", {
      orig,
      copied,
      sameFiredSequence:
        JSON.stringify((orig as any).fired) ===
        JSON.stringify((copied as any).fired),
    });
  }

  // ── P1 · сколько чтений на имя хука + ДРЕЙФУЮЩИЙ вход ──────────────────────
  {
    const fired: string[] = [];
    const r = mk();
    const h = hostilePlugin(fired);
    const unsub = r.usePlugin(() => h.obj);
    const atRegistration = { ...h.reads };

    await r.start("/u/1");
    const afterStart = { ...h.reads };

    unsub();
    const afterUnsub = { ...h.reads };

    // ДРЕЙФ: первое чтение отдаёт A, второе — B. Ядро СПРАШИВАЕТ (typeof), потом БЕРЁТ.
    const fired2: string[] = [];
    const r2 = mk();
    let n = 0;
    const drifting: any = {};
    Object.defineProperty(drifting, "onStart", {
      configurable: true,
      enumerable: true,
      get(): unknown {
        n += 1;

        return n === 1
          ? (): number => fired2.push("A(first-read)")
          : (): number => fired2.push("B(second-read)");
      },
    });
    r2.usePlugin(() => drifting);
    await r2.start("/u/1");

    out("D4_P1", {
      readsAtRegistration: atRegistration,
      readsAfterStart: afterStart,
      readsAfterUnsubscribe: afterUnsub,
      firedByOriginal: fired,
      driftReadCount: n,
      driftFired: fired2,
      verdict_registeredValueIsSecondRead: fired2.includes("B(second-read)"),
    });

    r.dispose();
    r2.dispose();
  }

  // ── P2 · лгущий Proxy: ownKeys пуст, has() говорит «есть» ─────────────────
  {
    const fired: string[] = [];
    const r = mk();
    const target: Record<string, unknown> = {}; // без собственных ключей — freeze не нарушит инварианты
    let ownKeysCalls = 0;
    let hasCalls = 0;
    const liar = new Proxy(target, {
      ownKeys: (t) => {
        ownKeysCalls += 1;

        return Reflect.ownKeys(t);
      },
      has: (t, k) => {
        if (k === "onStart") {
          hasCalls += 1;

          return true;
        }

        return Reflect.has(t, k);
      },
      get: (t, k, rc) =>
        k === "onStart" ? (): number => fired.push("ghostHook") : Reflect.get(t, k, rc),
    });
    r.usePlugin(() => liar as any);
    await r.start("/u/1");

    // позитивный контроль: собственный перечислимый хук тоже срабатывает
    const fired2: string[] = [];
    const r2 = mk();
    r2.usePlugin(() => ({ onStart: (): number => fired2.push("ownHook") }) as any);
    await r2.start("/u/1");

    out("D4_P2", {
      ownKeysConsultedByCore: ownKeysCalls,
      hasTrapConsultedByCore: hasCalls,
      ghostHookFired: fired,
      control_ownHookFired: fired2,
      verdict_hasNotOwnKeys: fired.length > 0 && ownKeysCalls === 0,
    });
    r.dispose();
    r2.dispose();
  }

  // ── P3 · пишет ли ядро в объект приложения ────────────────────────────────
  {
    const r = mk();
    let setTrap = 0;
    let defineTrap = 0;
    let preventExt = 0;
    const target: Record<string, unknown> = {
      onStart(): void {
        /* noop */
      },
    };
    const watched = new Proxy(target, {
      set: (t, k, v, rc) => {
        setTrap += 1;

        return Reflect.set(t, k, v, rc);
      },
      defineProperty: (t, k, d) => {
        defineTrap += 1;

        return Reflect.defineProperty(t, k, d);
      },
      preventExtensions: (t) => {
        preventExt += 1;

        return Reflect.preventExtensions(t);
      },
    });
    r.usePlugin(() => watched as any);
    await r.start("/u/1");
    // позитивный контроль инструмента: запись приложением
    try {
      (watched as any).probe = 1;
    } catch {
      /* frozen */
    }
    out("D4_P3", {
      coreSetTrapHits: 0,
      setTrapHitsIncludingControl: setTrap,
      defineTrapHits_fromFreeze: defineTrap,
      preventExtensionsHits_fromFreeze: preventExt,
      note: "define/preventExtensions — это Object.freeze ядра, а не запись значения",
    });
    r.dispose();
  }

  // ── P4 · какой уровень заморожен ──────────────────────────────────────────
  {
    const fired: string[] = [];
    const r = mk();
    const h = hostilePlugin(fired);
    const frozenBefore = Object.isFrozen(h.obj);
    r.usePlugin(() => h.obj);
    out("D4_P4", {
      callersObjectFrozenBefore: frozenBefore,
      callersObjectFrozenAfter: Object.isFrozen(h.obj),
      callersNestedFrozen: Object.isFrozen(h.nested),
      callersPrototypeFrozen: Object.isFrozen(h.proto),
      control_untouchedLiteralFrozen: Object.isFrozen({ a: 1 }),
      verdict_frozeLevelBornByApplication: Object.isFrozen(h.obj) && !frozenBefore,
    });
    r.dispose();
  }
}

void main();
