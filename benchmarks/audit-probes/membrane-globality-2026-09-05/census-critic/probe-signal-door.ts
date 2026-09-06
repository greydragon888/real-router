// Census-critic probe 2: `NavigationOptions.signal` — an object the caller
// builds (typed AbortSignal, structurally anything at runtime) that core holds
// for the whole transition and reads across frames. The census lists no door
// for it; `adoptNavigationOptions` skips the key WITHOUT reading it (per the
// family description) — the read happens elsewhere, and this counts where.
//
// Instrument: a fake signal with counting accessors and a captured listener.
// Positive control: a real AbortController — abort mid-guard must reject the
// navigation with TRANSITION_CANCELLED (proves the bridge branch is reached);
// then the fake, driven the same way, must reach the same branch and its
// `reason` read must register.
//
// Run (from W/benchmarks):
//   NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx \
//     audit-probes/membrane-globality-2026-09-05/census-critic/probe-signal-door.ts
import { createRouter, errorCodes } from "@real-router/core";

interface FakeSignal {
  readonly signal: object;
  readonly reads: Record<string, number>;
  fire: () => void;
}

function fakeSignal(): FakeSignal {
  const reads: Record<string, number> = {};
  const listeners: (() => void)[] = [];
  const bump = (k: string): void => {
    reads[k] = (reads[k] ?? 0) + 1;
  };
  let aborted = false;
  const signal = {};

  Object.defineProperty(signal, "aborted", {
    enumerable: true,
    get(): boolean {
      bump("aborted");

      return aborted;
    },
  });
  Object.defineProperty(signal, "reason", {
    enumerable: true,
    get(): unknown {
      bump("reason");

      return new Error("fake-reason");
    },
  });
  Object.defineProperty(signal, "addEventListener", {
    value: (_type: string, cb: () => void): void => {
      bump("addEventListener");
      listeners.push(cb);
    },
  });
  Object.defineProperty(signal, "removeEventListener", {
    value: (): void => {
      bump("removeEventListener");
    },
  });

  return {
    signal,
    reads,
    fire: (): void => {
      aborted = true;
      for (const cb of listeners) {
        cb();
      }
    },
  };
}

function makeRouter(): {
  router: ReturnType<typeof createRouter>;
  releaseGuard: () => void;
  successOpts: unknown[];
} {
  let release: () => void = () => {};
  const successOpts: unknown[] = [];
  const router = createRouter(
    [
      { name: "home", path: "/home" },
      {
        name: "g",
        path: "/g",
        canActivate: () => () =>
          new Promise<boolean>((resolve) => {
            release = (): void => {
              resolve(true);
            };
          }),
      },
    ] as never,
    {} as never,
  );

  router.usePlugin(() => ({
    onTransitionSuccess(_to: unknown, _from: unknown, opts: unknown) {
      successOpts.push(opts);
    },
  }));

  return { router, releaseGuard: (): void => release(), successOpts };
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;

    return "resolved";
  } catch (error) {
    return `rejected:${(error as { code?: string }).code ?? String(error)}`;
  }
}

async function main(): Promise<void> {
  // --- positive control: real signal, abort during the async guard
  const ctl = makeRouter();

  await ctl.router.start("/home");

  const ac = new AbortController();
  const pending = ctl.router.navigate("g", {}, undefined, { signal: ac.signal });

  await Promise.resolve();
  ac.abort(new Error("real-reason"));

  const controlOutcome = await codeOf(pending);

  // --- fake signal, never aborted: how often does core read it?
  const quiet = makeRouter();

  await quiet.router.start("/home");

  const f1 = fakeSignal();
  const nav1 = quiet.router.navigate("g", {}, undefined, {
    signal: f1.signal as never,
  });

  await Promise.resolve();
  quiet.releaseGuard();

  const quietOutcome = await codeOf(nav1);
  const readsQuiet = { ...f1.reads };
  const optsHandedToPlugin = quiet.successOpts.at(-1) as
    | Record<string, unknown>
    | undefined;

  // --- fake signal, fired mid-guard: does the bridge read `reason`?
  const fired = makeRouter();

  await fired.router.start("/home");

  const f2 = fakeSignal();
  const nav2 = fired.router.navigate("g", {}, undefined, {
    signal: f2.signal as never,
  });

  await Promise.resolve();
  f2.fire();

  const firedOutcome = await codeOf(nav2);

  console.log(
    JSON.stringify(
      {
        control_realSignalAbortMidGuard: {
          outcome: controlOutcome,
          expected: `rejected:${errorCodes.TRANSITION_CANCELLED}`,
        },
        fakeSignal_neverAborted: {
          outcome: quietOutcome,
          readsByCore: readsQuiet,
          signalKeyOnOptsHandedToPlugin:
            optsHandedToPlugin === undefined
              ? "no-success-hook"
              : Object.hasOwn(optsHandedToPlugin, "signal"),
        },
        fakeSignal_firedMidGuard: {
          outcome: firedOutcome,
          readsByCore: { ...f2.reads },
        },
      },
      null,
      2,
    ),
  );
}

void main();
