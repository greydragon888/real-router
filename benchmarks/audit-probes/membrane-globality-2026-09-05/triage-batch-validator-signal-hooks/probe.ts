// TRIAGE batch probe.
//
// Part A — the four RouterValidator route-batch rows: core snapshots the caller's
// array (`snapshotRouteBatch`), hands the SNAPSHOT (and its elements) to plugin
// code, and registers FROM THAT SAME SNAPSHOT afterwards. If a validator that
// mutates what it was given changes what core registers, core read the container
// back after the foreign frame → round-trip.
//
// Part B — `Plugin.onStop·return`: the one hook of the seven that the existing
// thenable probe did not measure.
//
// Every case has a control arm with the mutation disabled; differing outcomes
// prove the input reached the branch.
import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

type Mutator = (args: unknown[]) => void;

function install(router: unknown, method: string, mutate: Mutator): void {
  const validator = new Proxy(
    {},
    {
      get: (_t, group) =>
        new Proxy(
          {},
          {
            get:
              (_t2, m) =>
              (...args: unknown[]) => {
                if (`${String(group)}.${String(m)}` === method) mutate(args);
              },
          },
        ),
    },
  );
  (getInternals(router as never) as { validator?: unknown }).validator =
    validator;
}

const out: Record<string, unknown>[] = [];

function fresh() {
  return createRouter([{ name: "root", path: "/root" }] as never, {} as never);
}

function registeredPath(router: unknown, name: string): unknown {
  return (
    getRoutesApi(router as never).get(name) as { path?: unknown } | undefined
  )?.path;
}

function partA(): void {
  for (const arm of ["mutating", "control"] as const) {
    const on = arm === "mutating";

    // 1. validateRoutes·batch — LAST reader before addRoutes
    {
      const r = fresh();
      install(r, "routes.validateRoutes", (args) => {
        if (on) (args[0] as { path: string }[])[0].path = "/MUTATED";
      });
      const caller = [{ name: "v1", path: "/orig" }];
      getRoutesApi(r as never).add(caller as never);
      out.push({
        row: "RouterValidator.routes.validateRoutes·batch",
        arm,
        registeredPath: registeredPath(r, "v1"),
      });
    }

    // 2. throwIfInternalRouteInArray·batch — PUSH a whole route into the container
    {
      const r = fresh();
      install(r, "routes.throwIfInternalRouteInArray", (args) => {
        if (on)
          (args[0] as unknown[]).push({ name: "smuggled", path: "/smuggled" });
      });
      const caller = [{ name: "v2", path: "/v2" }];
      getRoutesApi(r as never).add(caller as never);
      out.push({
        row: "RouterValidator.routes.throwIfInternalRouteInArray·batch",
        arm,
        callerArrayLength: caller.length,
        smuggledRegistered: registeredPath(r, "smuggled"),
      });
    }

    // 3. guardRouteCallbacks·route — mutate the ELEMENT core hands over
    {
      const r = fresh();
      install(r, "routes.guardRouteCallbacks", (args) => {
        if (on) (args[0] as { path: string }).path = "/GRC";
      });
      getRoutesApi(r as never).add([{ name: "v3", path: "/orig3" }] as never);
      out.push({
        row: "RouterValidator.routes.guardRouteCallbacks·route",
        arm,
        registeredPath: registeredPath(r, "v3"),
      });
    }

    // 3b. guardRouteCallbacks·route on a CHILD (recursive arm)
    {
      const r = fresh();
      install(r, "routes.guardRouteCallbacks", (args) => {
        const route = args[0] as { name: string; path: string };
        if (on && route.name === "kid") route.path = "/KID";
      });
      getRoutesApi(r as never).add([
        {
          name: "v3c",
          path: "/v3c",
          children: [{ name: "kid", path: "/orig" }],
        },
      ] as never);
      out.push({
        row: "RouterValidator.routes.guardRouteCallbacks·route (child)",
        arm,
        registeredPath: registeredPath(r, "v3c.kid"),
      });
    }

    // 4. guardNoAsyncCallbacks·route — second reader of the same element
    {
      const r = fresh();
      install(r, "routes.guardNoAsyncCallbacks", (args) => {
        if (on) (args[0] as { path: string }).path = "/GNAC";
      });
      getRoutesApi(r as never).add([{ name: "v4", path: "/orig4" }] as never);
      out.push({
        row: "RouterValidator.routes.guardNoAsyncCallbacks·route",
        arm,
        registeredPath: registeredPath(r, "v4"),
      });
    }

    // NESTED-BAG arm: is the nested defaultParams still the CALLER's object
    // after registration (leaf by reference), and does a post-add write show up?
    {
      const r = fresh();
      const nested: Record<string, string> = { id: "before" };
      getRoutesApi(r as never).add([
        { name: "v5", path: "/v5/:id", defaultParams: nested },
      ] as never);
      if (on) nested.id = "after";
      out.push({
        row: "nested defaultParams identity (leaf-by-reference control)",
        arm,
        builtPath: (r as { buildPath(n: string): string }).buildPath("v5"),
      });
    }
  }
}

async function partB(): Promise<void> {
  for (const arm of ["thenable", "plain"] as const) {
    let thenReads = 0;
    let thenCalls = 0;
    const thenable =
      arm === "thenable"
        ? {
            get then() {
              thenReads += 1;
              return (res: (v: unknown) => void) => {
                thenCalls += 1;
                res(undefined);
              };
            },
          }
        : {
            get then() {
              thenReads += 1;
              return 42; // not a function → core must not call it
            },
          };

    const r = createRouter([{ name: "a", path: "/a" }] as never, {} as never);
    r.usePlugin((() => ({ onStop: () => thenable })) as never);
    await r.start("/a");
    r.stop();
    await new Promise((res) => setTimeout(res, 0));
    out.push({ row: "Plugin.onStop·return", arm, thenReads, thenCalls });
  }
}

async function main(): Promise<void> {
  partA();
  await partB();
  console.log(JSON.stringify(out, null, 1));
}

void main();
