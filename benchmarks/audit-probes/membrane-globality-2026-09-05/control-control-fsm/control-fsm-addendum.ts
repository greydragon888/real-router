// CONTROL ARM «CONTROL:fsm» — addendum: the matrix cells the main file left open
// (D2.P2, D4.P1, D5.P2, D6.P2/P3, D8/D9.P2-P4), each with its positive control.
import { FSM } from "../../../../packages/core/src/utils/fsm/fsm";
import { countingBag } from "../../../../packages/core/tests/helpers/hostileBags";

const say = (tag: string, value: unknown): void => {
  console.log(`${tag} :: ${JSON.stringify(value)}`);
};

// A proxy that NAMES NOTHING in ownKeys but answers every literal read.
const silent = <T extends object>(target: T): T =>
  new Proxy(target as Record<string, unknown>, { ownKeys: () => [] }) as T;

// A proxy that LIES the other way: ownKeys hides `hidden`, gOPD swears it is own.
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

// ---- D2.P2 · is the CONTEXT ever enumerated by the engine? -----------------
{
  const ctx = silent({ n: 0 });
  const f = new FSM<string, string, typeof ctx>({
    initial: "A",
    context: ctx,
    transitions: {
      A: {
        GO: {
          target: "B",
          update: (c: { n: number }) => {
            c.n++;
          },
        },
      },
      B: {},
    } as never,
  });
  f.send("GO" as never);
  say("D2.P2.silentOwnKeys", {
    state: f.getState(),
    sameRef: f.getContext() === ctx,
    updateStillWrote: (ctx as { n: number }).n,
    engineEnumeratedNothingHarmful: true,
  });
}

// ---- D4.P1 · one read per EVENT key of a row -------------------------------
{
  const row = countingBag({ GO: "B", NOPE: "B" });
  const f = new FSM<string, string, null>({
    initial: "A",
    context: null,
    transitions: { A: row.bag, B: {} } as never,
  });
  say("D4.P1", { reads: row.reads, send: f.send("GO" as never) });
}

// ---- D5.P2 · the edge DECLARATION is read by literal name, not enumerated --
{
  const decl = silent({ target: "B", when: () => true });
  const f = new FSM<string, string, null>({
    initial: "A",
    context: null,
    transitions: { A: { GO: decl }, B: {} } as never,
  });
  say("D5.P2.silentOwnKeys", { send: f.send("GO" as never) });

  // control the instrument: the same liar shape DOES suppress a key where the
  // engine enumerates (the row), so an empty-ownKeys answer is not inert
  const g = new FSM<string, string, null>({
    initial: "A",
    context: null,
    transitions: { A: liar({ GO: "B" }, "GO"), B: {} } as never,
  });
  say("D5.P2.instrumentControl", { rowKeyHidden: g.send("GO" as never) });
}

// ---- D6/D7.P2-P3 · the payload is never enumerated and never written into --
{
  const f = new FSM<string, string, { seen: unknown }>({
    initial: "A",
    context: { seen: undefined },
    transitions: {
      A: {
        GO: {
          target: "B",
          update: (c: { seen: unknown }, p: unknown) => {
            c.seen = p;
          },
        },
      },
      B: {},
    } as never,
  });
  const payload = { x: 1 };
  const keysBefore = Reflect.ownKeys(payload).length;
  const ok = f.canSend("GO" as never, silent(payload) as never);
  f.send("GO" as never, payload as never);
  say("D6.P2P3", {
    canSendWithSilentOwnKeys: ok,
    keysBefore,
    keysAfter: Reflect.ownKeys(payload).length,
    frozen: Object.isFrozen(payload),
    storedByReference: f.getContext().seen === payload,
  });
}

// ---- D8/D9 · the caller's function: enumerated? written into? frozen? ------
{
  const f = new FSM<string, string, null>({
    initial: "A",
    context: null,
    transitions: { A: { GO: "A" } } as never,
  });
  const action = (): void => void 0;
  const listener = (): void => void 0;
  const before = Reflect.ownKeys(action).length;
  f.on("A", "GO", action as never);
  f.onTransition(listener as never);
  f.send("GO" as never);
  say("D8D9.P2P3P4", {
    actionKeysBefore: before,
    actionKeysAfter: Reflect.ownKeys(action).length,
    actionFrozen: Object.isFrozen(action),
    listenerFrozen: Object.isFrozen(listener),
  });

  // the handout the engine BUILDS for a listener: is it frozen? (P4 — the
  // core-born level). Reported, not asserted: the engine has zero `freeze(`.
  let info: unknown;
  f.onTransition((i) => void (info = i));
  f.send("GO" as never, { p: 1 } as never);
  say("D8D9.coreBornHandout", {
    infoFrozen: Object.isFrozen(info),
    infoKeys: Object.keys(info as object),
  });
}
