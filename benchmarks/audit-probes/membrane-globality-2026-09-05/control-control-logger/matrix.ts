// CONTROL:logger — matrix probe. Rows = doors D1..D6, columns = experiment (a) + observers.
// Doors are read from source (RouterLogger.ts, guards.ts assertLoggerConfig), never from memory.
import { RouterLogger } from "../../../../packages/core/src/utils/logger/index";

type Rec = Record<string, unknown>;
const out: string[] = [];
const say = (k: string, v: unknown): void => {
  out.push(`${k} :: ${typeof v === "string" ? v : JSON.stringify(v)}`);
};

// ---------- console capture ----------
type Cap = { level: string; msg: unknown; args: unknown[] }[];
function capture<T>(fn: () => T): { cap: Cap; value: T } {
  const cap: Cap = [];
  const orig = { log: console.log, warn: console.warn, error: console.error };
  for (const lvl of ["log", "warn", "error"] as const) {
    (console as unknown as Rec)[lvl] = (m: unknown, ...a: unknown[]): void => {
      cap.push({ level: lvl, msg: m, args: a });
    };
  }
  try {
    return { cap, value: fn() };
  } finally {
    Object.assign(console, orig);
  }
}

// ================= POSITIVE CONTROLS (header) =================
{
  const seen: unknown[][] = [];
  const cb = (...a: unknown[]): void => {
    seen.push(a);
  };
  const lg = new RouterLogger({ level: "warn-error", callback: cb });
  const { cap } = capture(() => {
    lg.log("Ctx", "below-threshold");
    lg.warn("Ctx", "above-threshold", { leaf: 1 });
  });
  say("PC1.getConfig.level", lg.getConfig().level);
  say("PC1.callbackIdentity", lg.getConfig().callback === cb);
  say(
    "PC1.consoleLines",
    cap.map((c) => `${c.level}|${String(c.msg)}`),
  );
  say("PC1.callbackCalls", seen.length);
  try {
    lg.configure({ level: "nope" } as never);
    say("PC2.rejectsBadLevel", "NO THROW (unexpected)");
  } catch (e) {
    say("PC2.rejectsBadLevel", (e as Error).message);
  }
  try {
    lg.configure({ bogus: 1 } as never);
    say("PC2.rejectsUnknownKey", "NO THROW (unexpected)");
  } catch (e) {
    say("PC2.rejectsUnknownKey", (e as Error).message);
  }
}

// ============ EXPERIMENT (a): original vs pre-copied container ============
{
  const cb = (): void => {};
  const original: Rec = {
    level: "error-only",
    callback: cb,
    callbackIgnoresLevel: true,
  };
  const copy: Rec = { ...original }; // leaves = same references

  const a = new RouterLogger(original as never);
  const b = new RouterLogger(copy as never);
  const ca = a.getConfig();
  const cbb = b.getConfig();
  say(
    "D1.a.equalState",
    JSON.stringify({ ...ca, callback: typeof ca.callback }) ===
      JSON.stringify({ ...cbb, callback: typeof cbb.callback }),
  );
  say("D1.a.leafIdentityKept", ca.callback === cb && cbb.callback === cb);

  original.level = "none";
  original.callbackIgnoresLevel = false;
  say("D1.a.coreSeesLaterMutation", a.getConfig().level);

  const handed = a.getConfig() as unknown as Rec;
  handed.level = "MUTATED";
  say("D1.a.handoutWriteReachesCore", a.getConfig().level);

  const l1 = new RouterLogger();
  const l2 = new RouterLogger();
  const cfg: Rec = { level: "warn-error", callback: cb };
  l1.configure(cfg as never);
  l2.configure({ ...cfg } as never);
  say(
    "D2.a.equalState",
    JSON.stringify({ ...l1.getConfig(), callback: 0 }) ===
      JSON.stringify({ ...l2.getConfig(), callback: 0 }),
  );
  say("D2.a.callerBagUntouched", JSON.stringify(cfg));
  say("D2.a.callerBagFrozen", Object.isFrozen(cfg));
}

// ============ D3 getConfig·return — round-trip? ============
{
  const lg = new RouterLogger({ level: "error-only" });
  const r1 = lg.getConfig() as unknown as Rec;
  const r2 = lg.getConfig() as unknown as Rec;
  say("D3.freshEachCall", r1 !== r2);
  r1.level = "none";
  r1.callbackIgnoresLevel = true;
  say("D3.afterHandoutMutation", JSON.stringify(lg.getConfig()));
  const { cap } = capture(() => {
    lg.log("C", "m");
    lg.error("C", "e");
  });
  say(
    "D3.behaviourAfterHandoutMutation",
    cap.map((c) => c.level),
  );
  say("D3.handoutFrozen", Object.isFrozen(r2));
}

// ============ D4..D6 log/warn/error ...args ============
{
  const leaf = { deep: { n: 1 } };
  const seen: unknown[][] = [];
  const lg = new RouterLogger({
    level: "all",
    callback: (...a: unknown[]): void => {
      seen.push(a);
    },
  });
  const { cap } = capture(() => {
    lg.log("C", "m", leaf);
    lg.warn("C", "m", leaf);
    lg.error("C", "m", leaf);
  });
  say(
    "D4-6.consoleLeafIdentity",
    cap.map((c) => c.args[0] === leaf),
  );
  say(
    "D4-6.callbackLeafIdentity",
    seen.map((a) => a[3] === leaf),
  );
  say(
    "D4-6.leafFrozenAfter",
    Object.isFrozen(leaf) || Object.isFrozen(leaf.deep),
  );
  const arr = [leaf];
  const c1 = capture(() => {
    lg.log("C", "m", ...arr);
  });
  const c2 = capture(() => {
    lg.log("C", "m", ...[...arr]);
  });
  say(
    "D4-6.a.equalWithCopiedContainer",
    JSON.stringify(c1.cap.map((c) => c.msg)) ===
      JSON.stringify(c2.cap.map((c) => c.msg)) &&
      c1.cap[0]!.args[0] === c2.cap[0]!.args[0],
  );
  say("D4-6.argsArrayIsCoreBuilt", c1.cap[0]!.args !== arr);
}

console.log(out.join("\n"));
