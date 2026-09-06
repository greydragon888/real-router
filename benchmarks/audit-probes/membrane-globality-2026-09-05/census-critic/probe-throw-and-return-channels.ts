// Census-critic probe 5: the THROW channel of application callbacks and the
// thenable RETURN of hooks — both absent from the census as positions.
//
//  a. GuardFn·throw (plain object): errorHandling.ts · wrapSyncError walks
//     objectEntries(thrown) with putField into a fresh record — a throat; the
//     app's fields land on the RouterError every plugin's onTransitionError gets.
//  b. GuardFn·throw (Error instance): copied (message/stack/cause) — cause by ref.
//  c. LeaveFn·throw (Error instance): EventBusNamespace.awaitLeaveListeners →
//     ensureError → the SAME instance is the rejection and the onTransitionError
//     argument (transit by reference of an app object).
//  d. LeaveFn·throw (plain object): ensureError → `String(value)` — the app's
//     toString runs inside core.
//  e. Plugin hook throw: EventEmitter · #invokeIsolated → onListenerError →
//     Router.ts logger.error("Router", …, error) → LogCallback receives the
//     app's thrown object by reference (Options.logger.callback·args).
//  f. Plugin hook RETURN thenable: #invokeIsolated reads `.then`, then
//     Promise.resolve(result) calls it — a callback-return door for every hook
//     and for SubscribeFn (the census's thenable family lists guards, leave
//     listeners and the start interceptor only).
//
// Positive control: GuardFn·return (listed): returning a thenable resolves
// the navigation and its `then` is read.
//
// Run (from W/benchmarks):
//   NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx \
//     audit-probes/membrane-globality-2026-09-05/census-critic/probe-throw-and-return-channels.ts
import { createRouter, RouterError } from "@real-router/core";

import { countingBag } from "../../../../packages/core/tests/helpers/hostileBags";

async function settle(p: Promise<unknown>): Promise<unknown> {
  try {
    return { resolved: true, value: await p };
  } catch (error) {
    return { resolved: false, error };
  }
}

function thenableCounter(resolveWith: unknown): {
  obj: object;
  reads: () => number;
} {
  let reads = 0;
  const obj = {};

  Object.defineProperty(obj, "then", {
    get(): unknown {
      reads++;

      return (res: (v: unknown) => void): void => {
        res(resolveWith);
      };
    },
  });

  return { obj, reads: (): number => reads };
}

async function main(): Promise<void> {
  const out: Record<string, unknown> = {};

  // ---- a/b. GuardFn throw
  const thrownBag = countingBag({ foo: 1, code: "IGNORED", then: "reserved" });
  const thrownError = new Error("guard-error", { cause: { c: 1 } });
  let mode: "bag" | "error" | "ok" = "bag";
  const errSeen: unknown[] = [];
  const guardCtl = thenableCounter(true);
  const r = createRouter(
    [
      { name: "home", path: "/home" },
      {
        name: "g",
        path: "/g",
        canActivate: () => () => {
          if (mode === "bag") {
            throw thrownBag.bag;
          }

          if (mode === "error") {
            throw thrownError;
          }

          return guardCtl.obj as never;
        },
      },
    ] as never,
    {} as never,
  );

  r.usePlugin(() => ({
    onTransitionError(_to: unknown, _from: unknown, err: unknown) {
      errSeen.push(err);
    },
  }));
  await r.start("/home");

  const aRes = (await settle(r.navigate("g"))) as { error: RouterError };

  out.guardThrow_plainObject = {
    rejectionIsRouterError: aRes.error instanceof RouterError,
    rejectionIsTheThrownObject: (aRes.error as unknown) === thrownBag.bag,
    appFieldCopiedOntoRouterError: aRes.error.foo === 1,
    reservedKeyNotCopied_code: aRes.error.code,
    reservedKeyNotCopied_then: Object.hasOwn(aRes.error, "then"),
    readsOfThrownBag: { ...thrownBag.reads },
    hookGotSameObjectAsRejection: errSeen.at(-1) === aRes.error,
    rejectionFrozen: Object.isFrozen(aRes.error),
  };

  mode = "error";

  const bRes = (await settle(r.navigate("g"))) as { error: RouterError };

  out.guardThrow_errorInstance = {
    rejectionIsTheThrownError: (bRes.error as unknown) === thrownError,
    messageCopied: bRes.error.message === thrownError.message,
    causeByReference: bRes.error.cause === thrownError.cause,
  };

  mode = "ok";

  const cRes = (await settle(r.navigate("g"))) as { resolved: boolean };

  out.control_guardReturnThenable = {
    navigationResolved: cRes.resolved,
    thenReads: guardCtl.reads(),
  };

  // ---- c/d. LeaveFn throw
  const leaveError = new Error("leave-error");
  let toStringCalls = 0;
  const leaveBag = {
    toString(): string {
      toStringCalls++;

      return "leave-bag-string";
    },
  };
  let leaveMode: "error" | "bag" = "error";
  const leaveErrSeen: unknown[] = [];
  const r2 = createRouter(
    [
      { name: "home", path: "/home" },
      { name: "x", path: "/x" },
    ] as never,
    {} as never,
  );

  r2.usePlugin(() => ({
    onTransitionError(_to: unknown, _from: unknown, err: unknown) {
      leaveErrSeen.push(err);
    },
  }));
  r2.subscribeLeave(() => {
    throw leaveMode === "error" ? leaveError : leaveBag;
  });
  await r2.start("/home");

  const cRes2 = (await settle(r2.navigate("x"))) as { error: unknown };

  out.leaveThrow_errorInstance = {
    rejectionIsTheThrownError: cRes2.error === leaveError,
    hookGotTheThrownErrorByReference: leaveErrSeen.at(-1) === leaveError,
    rejectionFrozen: Object.isFrozen(cRes2.error),
  };

  leaveMode = "bag";

  const dRes = (await settle(r2.navigate("x"))) as { error: Error };

  out.leaveThrow_plainObject = {
    rejectionIsError: dRes.error instanceof Error,
    rejectionMessage: dRes.error.message,
    appToStringCalledInsideCore: toStringCalls,
  };

  // ---- e. Plugin hook throw → logger callback by reference
  const hookThrown = { hook: "thrown" };
  const logArgs: unknown[][] = [];
  const r3 = createRouter(
    [
      { name: "home", path: "/home" },
      { name: "y", path: "/y" },
    ] as never,
    {
      logger: {
        level: "all",
        callback: (...args: unknown[]) => {
          logArgs.push(args);
        },
      },
    } as never,
  );

  r3.usePlugin(() => ({
    onTransitionSuccess() {
      throw hookThrown;
    },
  }));
  await r3.start("/home");

  const eRes = (await settle(r3.navigate("y"))) as { resolved: boolean };

  out.pluginHookThrow = {
    navigationStillResolved: eRes.resolved,
    logCallbackReceivedThrownObjectByReference: logArgs.some((a) =>
      a.includes(hookThrown),
    ),
    logCallbackCalls: logArgs.length,
  };

  // ---- f. Plugin hook / SubscribeFn return thenable
  const hookThenable = thenableCounter(undefined);
  const subThenable = thenableCounter(undefined);
  const r4 = createRouter(
    [
      { name: "home", path: "/home" },
      { name: "z", path: "/z" },
    ] as never,
    {} as never,
  );

  r4.usePlugin(() => ({
    onTransitionSuccess: (): unknown => hookThenable.obj,
  }));
  r4.subscribe((): unknown => subThenable.obj);
  await r4.start("/home");
  await r4.navigate("z");
  await new Promise((resolve) => setTimeout(resolve, 0));

  out.hookReturnThenable = {
    pluginHook_thenReads: hookThenable.reads(),
    subscribeFn_thenReads: subThenable.reads(),
  };

  console.log(JSON.stringify(out, null, 2));
}

void main();
