// CONTROL:logger — follow-ups.
// (1) Is the getter-only [[Set]] outcome a strict-mode artefact of the probe, or
//     the real behaviour of guards.ts / RouterLogger.ts? Probe the WRITE SITE
//     that lives inside those modules.
// (2) D7 experiment (a): a pre-copied thenable vs the caller's original.
import { RouterLogger } from "../../../../packages/core/src/utils/logger/index";

type Rec = Record<string, unknown>;
const out: string[] = [];
const say = (k: string, v: unknown): void => {
  out.push(`${k} :: ${typeof v === "string" ? v : JSON.stringify(v)}`);
};

// probe-scope strictness (for comparison only)
say("strict.probeScope", (function (this: unknown) {
  return this === undefined;
})());

// (1a) getter-only inherited "level" -> the write site is `normalized.level = level`
//      inside guards.ts (assertLoggerConfig). Strict => TypeError.
{
  let outcome: string;
  let landed: unknown;
  Object.defineProperty(Object.prototype, "level", {
    configurable: true,
    get(): unknown {
      return "error-only";
    },
  });
  try {
    const lg = new RouterLogger();
    lg.configure({ level: "warn-error" } as never);
    landed = lg.getConfig().level;
    outcome = "no throw";
  } catch (e) {
    outcome = `${(e as Error).constructor.name}: ${(e as Error).message}`;
  } finally {
    delete (Object.prototype as unknown as Rec).level;
  }
  say("P3.getterOnly.level.outcome", outcome);
  say("P3.getterOnly.level.landed", landed === undefined ? "undefined" : landed);
}

// (1b) getter-only inherited "callbackIgnoresLevel": did the flag land?
{
  let landed: unknown;
  let outcome: string;
  Object.defineProperty(Object.prototype, "callbackIgnoresLevel", {
    configurable: true,
    get(): unknown {
      return undefined;
    },
  });
  try {
    const lg = new RouterLogger();
    lg.configure({ callbackIgnoresLevel: true } as never);
    landed = lg.getConfig().callbackIgnoresLevel;
    outcome = "no throw";
  } catch (e) {
    outcome = `${(e as Error).constructor.name}: ${(e as Error).message}`;
  } finally {
    delete (Object.prototype as unknown as Rec).callbackIgnoresLevel;
  }
  say("P3.getterOnly.flag.outcome", outcome);
  say("P3.getterOnly.flag.landed", String(landed));
}

// (1c) CONTROL that the accessor really shadows a fresh `{}` write in a STRICT
//      module: the probe's own module scope.
{
  let ctl: string;
  Object.defineProperty(Object.prototype, "zzGetterOnly", {
    configurable: true,
    get(): unknown {
      return 1;
    },
  });
  try {
    const o: Rec = {};
    o.zzGetterOnly = 2;
    ctl = `no throw; own=${String(Object.hasOwn(o, "zzGetterOnly"))}`;
  } catch (e) {
    ctl = `${(e as Error).constructor.name}`;
  } finally {
    delete (Object.prototype as unknown as Rec).zzGetterOnly;
  }
  say("P3.getterOnly.probeControl", ctl);
}

// (2) D7 experiment (a): original thenable vs a pre-copied container
{
  const lines: string[] = [];
  const orig = console.error;
  console.error = (m: unknown, e: unknown): void => {
    lines.push(`${String(m)} ${String((e as Error)?.message ?? e)}`);
  };
  const mkThenable = (tag: string): object => ({
    then(_res: unknown, rej: (e: unknown) => void): void {
      rej(new Error(`rejected-${tag}`));
    },
  });
  const original = mkThenable("original");
  const copied = { ...mkThenable("copied") };

  const l1 = new RouterLogger({
    level: "all",
    callback: (): unknown => original,
  } as never);
  const l2 = new RouterLogger({
    level: "all",
    callback: (): unknown => copied,
  } as never);
  const nolog = console.log;
  console.log = (): void => {};
  l1.log("C", "m");
  l2.log("C", "m");
  console.log = nolog;

  setTimeout(() => {
    console.error = orig;
    say("D7.a.originalVsCopiedContainer", lines);
    console.log(out.join("\n"));
  }, 20);
}
