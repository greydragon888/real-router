// CONTROL:logger — P1..P4 on doors D1 (constructor), D2 (configure), D7 (LogCallback·return).
// Every check carries a positive control and a drifting/lying input.
import { RouterLogger } from "../../../../packages/core/src/utils/logger/index";
import {
  countingBag,
  driftingBag,
} from "../../../../packages/core/tests/helpers/hostileBags";

type Rec = Record<string, unknown>;
const out: string[] = [];
const say = (k: string, v: unknown): void => {
  out.push(`${k} :: ${typeof v === "string" ? v : JSON.stringify(v)}`);
};

type Cap = { level: string; msg: unknown }[];
function capture<T>(fn: () => T): Cap {
  const cap: Cap = [];
  const orig = { log: console.log, warn: console.warn, error: console.error };
  for (const lvl of ["log", "warn", "error"] as const) {
    (console as unknown as Rec)[lvl] = (m: unknown): void => {
      cap.push({ level: lvl, msg: m });
    };
  }
  try {
    fn();

    return cap;
  } finally {
    Object.assign(console, orig);
  }
}

// ================== P1: one read per key ==================
{
  const cb = (): void => {};
  const { bag, reads } = countingBag({
    level: "warn-error",
    callback: cb,
    callbackIgnoresLevel: true,
  });
  const lg = new RouterLogger(bag as never);
  say("P1.D1.readsPerKey", reads);
  say("P1.D1.stateFromRead", lg.getConfig().level);

  const l2 = new RouterLogger();
  const c2 = countingBag({
    level: "error-only",
    callback: cb,
    callbackIgnoresLevel: false,
  });
  l2.configure(c2.bag as never);
  say("P1.D2.readsPerKey", c2.reads);

  // DRIFTING: first read legal, later reads a DIFFERENT legal value.
  const l3 = new RouterLogger();
  const d = driftingBag(
    { level: "all", callback: cb, callbackIgnoresLevel: false },
    { level: "none", callbackIgnoresLevel: true },
  );
  l3.configure(d.bag as never);
  say("P1.D2.drift.reads", d.reads);
  say("P1.D2.drift.state", JSON.stringify(l3.getConfig()));
  say(
    "P1.D2.drift.consoleAtAll",
    capture(() => {
      l3.error("C", "e");
    }).map((c) => c.level),
  );

  // POSITIVE CONTROL of the drifting instrument: a door that IS known to read
  // twice must show reads=2. Emulated here on the same fixture so the counter
  // itself is proven live.
  const pc = driftingBag({ k: 1 }, { k: 2 });
  const a1 = (pc.bag as unknown as Rec).k;
  const a2 = (pc.bag as unknown as Rec).k;
  say("P1.instrumentControl", { reads: pc.reads, a1, a2 });
}

// ================== P2: lying Proxy (ownKeys denies the key) ==================
{
  const mkProxy = (ownKeys: string[]): object =>
    new Proxy(
      {},
      {
        ownKeys: () => ownKeys,
        getOwnPropertyDescriptor: (_t, k) =>
          k === "level"
            ? {
                value: "none",
                writable: true,
                enumerable: true,
                configurable: true,
              }
            : undefined,
        get: (_t, k) => (k === "level" ? "none" : undefined),
      },
    );

  // POSITIVE CONTROL: honest proxy, ownKeys names "level" -> lands.
  const honest = new RouterLogger();
  honest.configure(mkProxy(["level"]) as never);
  say("P2.control.honestProxy.level", honest.getConfig().level);

  // LYING: ownKeys names nothing, gOPD claims "level" is own.
  const lying = mkProxy([]);
  say("P2.lying.ObjectKeys", Object.keys(lying));
  say("P2.lying.hasOwn", Object.hasOwn(lying, "level"));
  const lg = new RouterLogger();
  lg.configure(lying as never);
  say("P2.lying.levelLanded", lg.getConfig().level);
  say(
    "P2.lying.consoleSilenced",
    capture(() => {
      lg.error("C", "e");
    }).length,
  );
}

// ================== P3: inherited accessor / __proto__ ==================
{
  // (a) inherited getter+setter named "level" on Object.prototype
  let setterHits = 0;
  const setterSaw: unknown[] = [];
  Object.defineProperty(Object.prototype, "level", {
    configurable: true,
    get(): unknown {
      return "none";
    },
    set(v: unknown): void {
      setterHits += 1;
      setterSaw.push(v);
    },
  });
  let landed: unknown;
  let threw: string | undefined;
  try {
    const lg = new RouterLogger();
    lg.configure({ level: "warn-error" } as never);
    landed = lg.getConfig().level;
  } catch (e) {
    threw = (e as Error).message;
  } finally {
    delete (Object.prototype as unknown as Rec).level;
  }
  say("P3.a.inheritedSetterHits", setterHits);
  say("P3.a.inheritedSetterSaw", setterSaw);
  say("P3.a.landedLevel", landed === undefined ? "undefined" : landed);
  say("P3.a.threw", threw ?? "no throw");
  say("P3.a.prototypeCleaned", Object.hasOwn(Object.prototype, "level"));

  // (a2) does the poisoned level actually change behaviour? Re-run with a
  // getter answering "none" while the caller asked for "all".
  let silenced: unknown;
  Object.defineProperty(Object.prototype, "level", {
    configurable: true,
    get(): unknown {
      return "none";
    },
    set(): void {},
  });
  try {
    const lg = new RouterLogger();
    lg.configure({ level: "all" } as never);
    silenced = capture(() => {
      lg.error("C", "must-print");
    }).length;
  } finally {
    delete (Object.prototype as unknown as Rec).level;
  }
  say("P3.a2.consoleLinesWhenCallerAskedAll", silenced);

  // (b) inherited accessor named "callback" — the #config write site that has
  // no own property to shadow it.
  let cbSetterHits = 0;
  let cbThrew: string | undefined;
  let cbLanded: unknown;
  const real = (): void => {};
  Object.defineProperty(Object.prototype, "callback", {
    configurable: true,
    get(): unknown {
      return undefined;
    },
    set(): void {
      cbSetterHits += 1;
    },
  });
  try {
    const lg = new RouterLogger();
    lg.configure({ callback: real } as never);
    cbLanded = lg.getConfig().callback === real;
  } catch (e) {
    cbThrew = (e as Error).message;
  } finally {
    delete (Object.prototype as unknown as Rec).callback;
  }
  say("P3.b.callbackSetterHits", cbSetterHits);
  say("P3.b.callbackLandedIdentical", cbLanded);
  say("P3.b.threw", cbThrew ?? "no throw");

  // (c) getter-only inherited accessor: strict-mode [[Set]] must throw.
  let getterOnlyThrew: string | undefined;
  Object.defineProperty(Object.prototype, "callbackIgnoresLevel", {
    configurable: true,
    get(): unknown {
      return undefined;
    },
  });
  try {
    const lg = new RouterLogger();
    lg.configure({ callbackIgnoresLevel: true } as never);
    getterOnlyThrew = "no throw";
  } catch (e) {
    getterOnlyThrew = `${(e as Error).constructor.name}: ${(e as Error).message}`;
  } finally {
    delete (Object.prototype as unknown as Rec).callbackIgnoresLevel;
  }
  say("P3.c.getterOnlyOutcome", getterOnlyThrew);

  // (d) own "__proto__" key from JSON.parse
  const parsed: unknown = JSON.parse('{"__proto__":{"polluted":1}}');
  let protoOutcome: string;
  try {
    new RouterLogger(parsed as never);
    protoOutcome = "accepted (no throw)";
  } catch (e) {
    protoOutcome = (e as Error).message;
  }
  say("P3.d.ownProtoKey", protoOutcome);
  say("P3.d.prototypePolluted", "polluted" in ({} as Rec));

  // POSITIVE CONTROL that the Object.prototype instrument itself works: a
  // plain `{}` assignment IS captured by an inherited setter.
  let ctlHits = 0;
  Object.defineProperty(Object.prototype, "zzProbe", {
    configurable: true,
    set(): void {
      ctlHits += 1;
    },
    get(): unknown {
      return "from-prototype";
    },
  });
  const plain: Rec = {};
  plain.zzProbe = 1;
  const ctlRead = plain.zzProbe;
  delete (Object.prototype as unknown as Rec).zzProbe;
  say("P3.instrumentControl", { ctlHits, ctlRead, own: Object.hasOwn(plain, "zzProbe") });
}

// ================== P4: freeze depth ==================
{
  const cb = (): void => {};
  const caller: Rec = { level: "all", callback: cb, callbackIgnoresLevel: false };
  const lg = new RouterLogger(caller as never);
  lg.configure(caller as never);
  say("P4.callerBagFrozen", Object.isFrozen(caller));
  say("P4.callerLeafFn.frozen", Object.isFrozen(cb));
  say("P4.handoutFrozen", Object.isFrozen(lg.getConfig()));
  const args = { nested: { a: 1 } };
  capture(() => {
    lg.error("C", "m", args);
  });
  say("P4.argLeafFrozen", Object.isFrozen(args) || Object.isFrozen(args.nested));
  // core-generated module constants
  const mod = require("../../../../packages/core/src/utils/logger/constants") as Rec;
  say("P4.LOG_LEVELS.frozen", Object.isFrozen(mod.LOG_LEVELS));
  say("P4.LEVEL_CONFIGS.frozen", Object.isFrozen(mod.LEVEL_CONFIGS));
}

// ================== D7: LogCallback·return consumed by core ==================
{
  // P1 on the returned thenable: how many times does core read `then`?
  let thenReads = 0;
  const readsSaw: string[] = [];
  const drifting = {
    get then(): unknown {
      thenReads += 1;
      readsSaw.push(`read#${thenReads}`);
      if (thenReads === 1) {
        // first read: a legal thenable -> core's duck-check passes
        return (res: (v: unknown) => void): void => {
          res(1);
        };
      }

      // second read: a DIFFERENT outcome
      return (_res: unknown, rej: (e: unknown) => void): void => {
        rej(new Error("from-SECOND-read-of-then"));
      };
    },
  };
  const lines: string[] = [];
  const orig = console.error;
  console.error = (m: unknown, e: unknown): void => {
    lines.push(`${String(m)} ${String((e as Error)?.message ?? e)}`);
  };
  const lg = new RouterLogger({
    level: "all",
    callback: (): unknown => drifting,
  } as never);
  lg.log("C", "m");
  setTimeout(() => {
    console.error = orig;
    say("D7.P1.thenReads", thenReads);
    say("D7.P1.readsSaw", readsSaw);
    say("D7.P1.reportedFromSecondRead", lines);
    console.log(out.join("\n"));
  }, 20);
}
