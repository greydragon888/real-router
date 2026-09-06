// CONTROL ARM «CONTROL:fsm» — matrix probe over packages/core/src/utils/fsm.
// Rows: D1..D10 (doors). Columns: experiment (a), P1, P2, P3, P4.
// Every section prints its own POSITIVE CONTROL first.
import { FSM } from "../../../../packages/core/src/utils/fsm/fsm";
import {
  countingBag,
  driftingBag,
  countingProxy,
} from "../../../../packages/core/tests/helpers/hostileBags";

const say = (tag: string, value: unknown): void => {
  console.log(`${tag} :: ${JSON.stringify(value)}`);
};

const mkTable = () => ({ A: { GO: "B" }, B: { BACK: "A" } });

// ===================== HEADER: positive control of the whole rig ============
{
  const table = mkTable();
  const ctx = { n: 0 } as Record<string, unknown>;
  const fsm = new FSM<string, string, typeof ctx>({
    initial: "A",
    context: ctx,
    transitions: table as never,
  });
  const seen: string[] = [];
  fsm.onTransition((i) => seen.push(`${i.from}->${i.to}`));
  fsm.on("A", "GO", () => seen.push("action"));
  const after = fsm.send("GO" as never);
  say("PC.rig", {
    initial: "A",
    afterSend: after,
    seen,
    ctxIdentity: fsm.getContext() === ctx,
    canSendBack: fsm.canSend("BACK" as never),
  });
}

// ===================== D1 · constructor·config ==============================
{
  const table = mkTable();
  const ctx = { n: 0 };
  const cfg = { initial: "A", context: ctx, transitions: table };
  const orig = new FSM<string, string, typeof ctx>(cfg as never);
  const copied = new FSM<string, string, typeof ctx>({ ...cfg } as never);
  const obs = (f: FSM<string, string, typeof ctx>) => [
    f.getState(),
    f.send("GO" as never),
    f.canSend("BACK" as never),
    f.getContext() === ctx,
  ];
  const a = obs(orig);
  const b = obs(copied);
  say("D1.a", {
    orig: a,
    copy: b,
    equal: JSON.stringify(a) === JSON.stringify(b),
  });

  cfg.initial = "B";
  (cfg as never as Record<string, unknown>).context = { n: 99 };
  say("D1.a.postMutation", {
    state: orig.getState(),
    ctxStillOriginal: orig.getContext() === ctx,
  });

  const { bag, reads } = countingBag({
    initial: "A",
    context: ctx,
    transitions: mkTable(),
  });
  const f1 = new FSM<string, string, typeof ctx>(bag as never);
  say("D1.P1.reads", { reads, state: f1.getState() });

  const drift = driftingBag(
    { initial: "A", context: ctx, transitions: mkTable() },
    { initial: "B" },
  );
  const f2 = new FSM<string, string, typeof ctx>(drift.bag as never);
  say("D1.P1.drift", {
    reads: drift.reads,
    state: f2.getState(),
    canGO: f2.canSend("GO" as never),
  });

  const silentKeys = new Proxy(
    { initial: "A", context: ctx, transitions: mkTable() } as Record<
      string,
      unknown
    >,
    { ownKeys: () => [] },
  );
  let p2: unknown;
  try {
    p2 = new FSM<string, string, typeof ctx>(silentKeys as never).getState();
  } catch (e) {
    p2 = `threw: ${(e as Error).message}`;
  }
  say("D1.P2.noEnumeration", { state: p2 });

  const cfg2 = { initial: "A", context: ctx, transitions: mkTable() };
  const before = Reflect.ownKeys(cfg2).length;
  new FSM<string, string, typeof ctx>(cfg2 as never);
  say("D1.P3.noWriteIntoConfig", {
    keysBefore: before,
    keysAfter: Reflect.ownKeys(cfg2).length,
  });

  say("D1.P4.frozen", {
    config: Object.isFrozen(cfg2),
    table: Object.isFrozen(cfg2.transitions),
  });
}

// ===================== D2 / D10 · config.context and getContext·return ======
{
  const table = {
    A: {
      GO: {
        target: "B",
        update: (c: { n: number }) => {
          c.n++;
        },
      },
    },
    B: {},
  };
  const ctx = { n: 0 };

  const withOriginal = new FSM<string, string, typeof ctx>({
    initial: "A",
    context: ctx,
    transitions: table as never,
  });
  const ctx2 = { n: 0 };
  const withCopy = new FSM<string, string, typeof ctx>({
    initial: "A",
    context: { ...ctx2 },
    transitions: table as never,
  });
  withOriginal.send("GO" as never);
  withCopy.send("GO" as never);
  say("D2.a.BREAKAGE", {
    identity_original: withOriginal.getContext() === ctx,
    identity_copy: withCopy.getContext() === ctx2,
    callerSeesUpdate_original: ctx.n,
    callerSeesUpdate_copy: ctx2.n,
  });

  const noRead = countingBag({ n: 0 });
  const f1 = new FSM<string, string, Record<string, unknown>>({
    initial: "A",
    context: noRead.bag,
    transitions: { A: { GO: "B" }, B: {} } as never,
  });
  f1.send("GO" as never);
  f1.canSend("GO" as never);
  const engineReads = JSON.parse(JSON.stringify(noRead.reads));
  const withRead = countingBag({ n: 0 });
  const f2 = new FSM<string, string, Record<string, unknown>>({
    initial: "A",
    context: withRead.bag,
    transitions: {
      A: {
        GO: { target: "B", update: (c: Record<string, unknown>) => void c.n },
      },
      B: {},
    } as never,
  });
  f2.send("GO" as never);
  say("D2.P1", {
    engineReadsOfContextKeys: engineReads,
    viaUpdate: withRead.reads,
  });

  const hits: string[] = [];
  Object.defineProperty(Object.prototype, "n", {
    configurable: true,
    get(): unknown {
      return undefined;
    },
    set(): void {
      hits.push("inherited-setter-fired");
    },
  });
  try {
    const bare = Object.create(null) as Record<string, unknown>;
    const f3 = new FSM<string, string, Record<string, unknown>>({
      initial: "A",
      context: bare,
      transitions: { A: { GO: "B" }, B: {} } as never,
    });
    f3.send("GO" as never);
    const engineHits = hits.length;
    const control: Record<string, unknown> = {};
    control.n = 1;
    say("D2.P3", { engineHits, trapArmed: hits.length - engineHits === 1 });
  } finally {
    delete (Object.prototype as never as Record<string, unknown>).n;
  }

  say("D2.P4.frozen", { callerContext: Object.isFrozen(ctx) });
}

// ===================== D3/D4/D5 · transitions, rows, edge declarations ======
{
  const table = mkTable();
  const deepCopy = {
    A: { ...table.A },
    B: { ...table.B },
  };
  const mk = (t: object) =>
    new FSM<string, string, null>({
      initial: "A",
      context: null,
      transitions: t as never,
    });
  const trace = (f: FSM<string, string, null>) => [
    f.getState(),
    f.send("GO" as never),
    f.canSend("BACK" as never),
    f.send("BACK" as never),
  ];
  const a = trace(mk(table));
  const b = trace(mk(deepCopy));
  say("D3.a", {
    orig: a,
    copy: b,
    equal: JSON.stringify(a) === JSON.stringify(b),
  });

  const live = { A: { GO: { target: "B" } }, B: { BACK: "A" } };
  const f = mk(live);
  (live.A.GO as Record<string, unknown>).target = "A";
  delete (live.A as Record<string, unknown>).GO;
  (live as Record<string, unknown>).B = undefined;
  say("D3.a.postMutation", { send: f.send("GO" as never) });

  const t1 = countingBag(mkTable());
  mk(t1.bag);
  say("D3.P1.reads", t1.reads);

  const decl = driftingBag(
    { target: "B", when: () => true, update: () => {} },
    { target: "A", when: "not-a-function", update: 42 },
  );
  const f5 = mk({ A: { GO: decl.bag }, B: {} });
  say("D5.P1", {
    reads: decl.reads,
    send: f5.send("GO" as never),
  });
  let thrown = "none";
  try {
    mk({ A: { GO: { target: "B", when: "not-a-function" } }, B: {} });
  } catch (e) {
    thrown = (e as Error).message;
  }
  say("D5.P1.positiveControl", { thrown });

  const liar = (target: Record<string, unknown>, hidden: string) =>
    new Proxy(target, {
      ownKeys: (t) => Reflect.ownKeys(t).filter((k) => k !== hidden),
      getOwnPropertyDescriptor: (t, k) =>
        k === hidden
          ? {
              value: t[hidden],
              enumerable: true,
              configurable: true,
              writable: true,
            }
          : Reflect.getOwnPropertyDescriptor(t, k),
    });
  let d3p2: string;
  try {
    d3p2 = `state=${mk(liar({ A: { GO: "B" }, B: {} }, "B")).getState()}`;
  } catch (e) {
    d3p2 = `threw: ${(e as Error).message}`;
  }
  const truthful = new Proxy(
    { A: { GO: "B" }, B: {} } as Record<string, unknown>,
    {},
  );
  say("D3.P2", { lying: d3p2, truthful: mk(truthful).send("GO" as never) });

  const rowLiar = { A: liar({ GO: "B" }, "GO"), B: {} };
  const f4 = mk(rowLiar);
  say("D4.P2", {
    sendWithHiddenEdge: f4.send("GO" as never),
    sendControl: mk({ A: { GO: "B" }, B: {} }).send("GO" as never),
  });

  const protoKeyTable = JSON.parse(
    '{"__proto__":{"GO":"S"},"S":{"BACK":"__proto__"}}',
  ) as Record<string, unknown>;
  let p3: unknown;
  try {
    const fp = new FSM<string, string, null>({
      initial: "__proto__",
      context: null,
      transitions: protoKeyTable as never,
    });
    p3 = {
      state0: fp.getState(),
      afterGO: fp.send("GO" as never),
      afterBACK: fp.send("BACK" as never),
      objectPrototypePolluted:
        Object.getPrototypeOf({}) !== Object.prototype || "GO" in Object.prototype,
    };
  } catch (e) {
    p3 = `threw: ${(e as Error).message}`;
  }
  say("D3.P3.protoKey", p3);

  const setterHits: string[] = [];
  Object.defineProperty(Object.prototype, "GHOST", {
    configurable: true,
    get: () => undefined,
    set: () => void setterHits.push("fired"),
  });
  try {
    const fg = new FSM<string, string, null>({
      initial: "GHOST",
      context: null,
      transitions: { GHOST: { GO: "GHOST" } } as never,
    });
    const engineHits = setterHits.length;
    const control: Record<string, unknown> = {};
    control.GHOST = 1;
    say("D3.P3.inheritedSetter", {
      engineHits,
      trapArmed: setterHits.length - engineHits === 1,
      machineWorks: fg.send("GO" as never),
    });
  } finally {
    delete (Object.prototype as never as Record<string, unknown>).GHOST;
  }

  const t4 = mkTable();
  const decl4 = { target: "B" };
  mk({ A: { GO: decl4 }, B: {} });
  mk(t4);
  say("D3.P4.frozen", {
    table: Object.isFrozen(t4),
    row: Object.isFrozen(t4.A),
    decl: Object.isFrozen(decl4),
  });
}

// ===================== D6/D7 · send·payload and canSend·payload =============
{
  // The identity predicate the router actually ships: routerFSM · mayCommit
  //   `payload !== undefined && payload === ctx.inflight && …`
  //   routerFSM · mayFail: `payload.nav === ctx.inflight`
  type Ctx = { inflight: unknown };
  const table = {
    A: {
      START: {
        target: "A",
        update: (c: Ctx, p: unknown) => {
          c.inflight = p;
        },
      },
      COMPLETE: {
        target: "B",
        when: (c: Ctx, p: unknown) => p !== undefined && p === c.inflight,
      },
    },
    B: {},
  };
  const run = (copyAtBoundary: boolean) => {
    const ctx: Ctx = { inflight: undefined };
    const fsm = new FSM<string, string, Ctx>({
      initial: "A",
      context: ctx,
      transitions: table as never,
    });
    const payload = { toState: { name: "u" } };
    const door = (event: string, p: object) =>
      fsm.send(event as never, (copyAtBoundary ? { ...p } : p) as never);
    const ask = (event: string, p: object) =>
      fsm.canSend(event as never, (copyAtBoundary ? { ...p } : p) as never);
    door("START", payload);
    return {
      canCommit: ask("COMPLETE", payload),
      state: door("COMPLETE", payload),
    };
  };
  say("D6.a.BREAKAGE", { original: run(false), withBoundaryCopy: run(true) });

  const ctx = { inflight: undefined };
  const fsm = new FSM<string, string, typeof ctx>({
    initial: "A",
    context: ctx,
    transitions: { A: { GO: "B" }, B: {} } as never,
  });
  let seenInfo: unknown;
  let seenAction: unknown;
  fsm.on("A", "GO", (p: unknown) => void (seenAction = p));
  fsm.onTransition((i) => void (seenInfo = i.payload));
  const payload = { x: 1 };
  fsm.send("GO" as never, payload as never);
  say("D6.a.identityContract", {
    infoPayloadIsSame: seenInfo === payload,
    actionPayloadIsSame: seenAction === payload,
    wouldHoldForCopy: ({ ...payload } as unknown) === (payload as unknown),
  });

  const counted = countingProxy({ x: 1, y: 2 });
  const f = new FSM<string, string, null>({
    initial: "A",
    context: null,
    transitions: { A: { GO: "B" }, B: {} } as never,
  });
  let delivered: unknown;
  f.onTransition((i) => void (delivered = i.payload));
  f.canSend("GO" as never, counted.bag as never);
  f.send("GO" as never, counted.bag as never);
  const engineReads = JSON.parse(JSON.stringify(counted.reads));
  const positive = (delivered as Record<string, unknown>).x;
  say("D6.P1", {
    engineReadsOfPayloadKeys: engineReads,
    afterOneControlRead: counted.reads,
    positive,
    deliveredIsSameObject: delivered === counted.bag,
  });
  const pl = { x: 1 };
  f.send("BACK" as never, pl as never);
  say("D6.P4.frozen", { payload: Object.isFrozen(pl) });
}

// ===================== D8/D9 · on·action and onTransition·listener ==========
{
  const f = new FSM<string, string, null>({
    initial: "A",
    context: null,
    transitions: { A: { GO: "B" }, B: { BACK: "A" } } as never,
  });
  const reads: string[] = [];
  const base = (): void => void 0;
  const spyFn = new Proxy(base, {
    get(t, k, r) {
      if (typeof k === "string") reads.push(k);
      return Reflect.get(t, k, r);
    },
  });
  const off = f.on("A", "GO", spyFn as never);
  const offL = f.onTransition(spyFn as never);
  const engineReads = reads.slice();
  f.send("GO" as never);
  say("D8.P1", {
    engineReadsOfFunctionProps: engineReads,
    afterDispatch: reads,
  });

  const g = new FSM<string, string, null>({
    initial: "A",
    context: null,
    transitions: { A: { GO: "A" } } as never,
  });
  const calls: string[] = [];
  const action = (): void => void calls.push("act");
  const un1 = g.on("A", "GO", action as never);
  g.on("A", "GO", action as never);
  un1();
  g.send("GO" as never);
  const direct = calls.length;
  const wrap = (fn: () => void) => () => fn();
  const h = new FSM<string, string, null>({
    initial: "A",
    context: null,
    transitions: { A: { GO: "A" } } as never,
  });
  const un3 = h.on("A", "GO", wrap(action) as never);
  h.on("A", "GO", wrap(action) as never);
  un3();
  h.send("GO" as never);
  say("D8.a", {
    directAliasing: direct,
    wrappedAliasing: calls.length - direct,
  });
  off();
  offL();
}
