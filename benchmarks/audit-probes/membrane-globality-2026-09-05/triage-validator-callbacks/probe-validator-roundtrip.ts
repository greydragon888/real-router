// TRIAGE probe for the 12 RouterValidator rows of this batch.
//
// Question: after core hands the CALLER's container to plugin code
// (`ctx.validator?.…`), does core READ THAT SAME CONTAINER BACK in the same
// frame? A validator that MUTATES the container it is given answers it by
// execution: if the mutation is observable in core's result, core read the
// container after the foreign frame → round-trip.
//
// Control arm on EVERY case: the identical call with the mutation disabled
// (`arm: "control"`). Differing outcomes = the input reached the branch.
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
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

function clearValidator(router: unknown): void {
  (getInternals(router as never) as { validator?: unknown }).validator =
    undefined;
}

const routes = [
  { name: "a", path: "/a" },
  { name: "b", path: "/b/:id?q" },
];

const out: unknown[] = [];
const rec = (o: Record<string, unknown>): void => {
  out.push(o);
};

async function fresh() {
  const r = createRouter(routes as never, {
    defaultRoute: "a",
  } as never);
  await r.start("/a");
  return r;
}

async function main(): Promise<void> {
  for (const arm of ["mutating", "control"] as const) {
    const on = arm === "mutating";

    // A/B: buildPath·params, buildPath·search
    {
      const r = await fresh();
      const P: Record<string, string> = { id: "1" };
      install(r, "navigation.validateParams", (args) => {
        if (on) (args[0] as Record<string, string>).id = "MUT";
      });
      rec({
        row: "validateParams·params@buildPath",
        arm,
        path: r.buildPath("b", P),
      });
      clearValidator(r);
      install(r, "navigation.validateSearch", (args) => {
        if (on) (args[0] as Record<string, string>).q = "MUT";
      });
      const S: Record<string, string> = { q: "orig" };
      rec({
        row: "validateSearch·search@buildPath",
        arm,
        path: r.buildPath("b", { id: "1" }, S),
      });
    }

    // C/D: canNavigateTo·params, canNavigateTo·search
    {
      const r = await fresh();
      install(r, "navigation.validateParams", (args) => {
        if (on) delete (args[0] as Record<string, string>).id;
      });
      rec({
        row: "validateParams·params@canNavigateTo",
        arm,
        verdict: r.canNavigateTo("b", { id: "1" }),
      });
      clearValidator(r);
      install(r, "navigation.validateSearch", (args) => {
        if (!on) return;
        Object.defineProperty(args[0] as object, "boom", {
          enumerable: true,
          configurable: true,
          get() {
            throw new Error("read back after the plugin frame");
          },
        });
      });
      rec({
        row: "validateSearch·search@canNavigateTo",
        arm,
        verdict: r.canNavigateTo("b", { id: "1" }, { q: "x" }),
      });
    }

    // E/F: navigate·routeParams, navigate·search
    {
      const r = await fresh();
      install(r, "navigation.validateParams", (args) => {
        if (on) (args[0] as Record<string, string>).id = "MUT";
      });
      const s1 = await r.navigate("b", { id: "1" }).catch((e: unknown) => e);
      rec({
        row: "validateParams·routeParams@navigate",
        arm,
        params: (s1 as { params?: unknown }).params,
      });
      clearValidator(r);
      install(r, "navigation.validateSearch", (args) => {
        if (on && args[0]) (args[0] as Record<string, string>).q = "MUT";
      });
      const s2 = await r
        .navigate("b", { id: "2" }, { q: "orig" })
        .catch((e: unknown) => e);
      rec({
        row: "validateSearch·search@navigate",
        arm,
        search: (s2 as { search?: unknown }).search,
      });
    }

    // G: navigate·opts (validateNavigationOptions)
    {
      const r = await fresh();
      await r.navigate("b", { id: "1" });
      install(r, "navigation.validateNavigationOptions", (args) => {
        if (on) (args[0] as Record<string, unknown>).reload = true;
      });
      const O: Record<string, unknown> = { replace: true };
      const res = await r
        .navigate("b", { id: "1" }, undefined, O)
        .then(() => "resolved")
        .catch((e: { code?: string }) => `rejected:${e.code ?? "?"}`);
      rec({ row: "validateNavigationOptions·opts@navigate", arm, res });
    }

    // H/I: navigateToDefault — first reader and second reader
    {
      const r = await fresh(); // already at "a" == default route
      install(r, "navigation.validateNavigateToDefaultArgs", (args) => {
        if (on) (args[0] as Record<string, unknown>).reload = true;
      });
      const O1: Record<string, unknown> = { replace: true };
      const res1 = await r
        .navigateToDefault(O1)
        .then(() => "resolved")
        .catch((e: { code?: string }) => `rejected:${e.code ?? "?"}`);
      rec({ row: "validateNavigateToDefaultArgs·options", arm, res: res1 });

      const r2 = await fresh();
      install(r2, "navigation.validateNavigationOptions", (args) => {
        if (on) (args[0] as Record<string, unknown>).reload = true;
      });
      const O2: Record<string, unknown> = { replace: true };
      const res2 = await r2
        .navigateToDefault(O2)
        .then(() => "resolved")
        .catch((e: { code?: string }) => `rejected:${e.code ?? "?"}`);
      rec({
        row: "validateNavigationOptions·opts@navigateToDefault",
        arm,
        res: res2,
      });
    }

    // J: areStatesEqual·state1 / state2 (APP-BUILT State literals)
    {
      const r = await fresh();
      const mk = (id: string) => ({
        name: "b",
        params: { id },
        search: {},
        path: `/b/${id}`,
        meta: undefined,
        context: {},
      });
      install(r, "state.validateAreStatesEqualArgs", (args) => {
        if (on) (args[0] as { params: Record<string, string> }).params.id = "9";
      });
      const A = mk("1");
      const B = mk("1");
      rec({
        row: "validateAreStatesEqualArgs·state1",
        arm,
        equal: r.areStatesEqual(A as never, B as never),
      });
      clearValidator(r);
      install(r, "state.validateAreStatesEqualArgs", (args) => {
        if (on) (args[1] as { params: Record<string, string> }).params.id = "7";
      });
      const C = mk("1");
      const D = mk("1");
      rec({
        row: "validateAreStatesEqualArgs·state2",
        arm,
        equal: r.areStatesEqual(C as never, D as never),
      });
    }

    // K: PluginApi.makeState·params
    {
      const r = await fresh();
      const api = getPluginApi(r as never);
      install(r, "state.validateMakeStateArgs", (args) => {
        if (on) (args[1] as Record<string, string>).id = "MUT";
      });
      const st = api.makeState("b", { id: "1" }, {});
      rec({
        row: "validateMakeStateArgs·params",
        arm,
        params: st.params,
        path: st.path,
      });
    }
  }

  console.log(JSON.stringify(out, null, 1));
}

void main();
