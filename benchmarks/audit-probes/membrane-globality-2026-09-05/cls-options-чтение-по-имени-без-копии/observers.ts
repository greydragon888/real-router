// ХЭНДАУТЫ-НАБЛЮДАТЕЛИ дверей A и B: через что приложение видит объект двери.
// A: RouterInternals.getOptions·return, RouterInternals.getCloneState·return.options
// B: RouterInternals.getCloneState·return, .options, cloneRouter·router
import { createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

const out: Record<string, unknown> = {};

// --- A: мешок queryParams ---------------------------------------------------
{
  const qp = { arrayFormat: "brackets" };
  const r = createRouter([{ name: "s", path: "/s?a" }] as never, {
    queryParams: qp,
  } as never);
  const ctx = getInternals(r);
  const cs = ctx.getCloneState() as unknown as {
    options: Record<string, unknown>;
  };
  const store = ctx.routeGetStore() as unknown as {
    matcherOptions: { queryParams: unknown };
  };

  out.A = {
    getOptions_isCallerBag: (
      getPluginApi(r).getOptions() as unknown as { queryParams: unknown }
    ).queryParams === (qp as unknown),
    getCloneState_options_isCallerBag: cs.options.queryParams === (qp as unknown),
    matcherOptions_isCallerBag: store.matcherOptions.queryParams === (qp as unknown),
    matcherOptionsSnapshot: JSON.stringify(store.matcherOptions.queryParams),
    posControl_url: r.buildPath("s", {}, { a: ["x", "y"] } as never),
  };
  r.dispose();
}

// --- B: контейнер CloneOptions ---------------------------------------------
{
  const leaf = { level: "none" };
  const opts = { logger: leaf };
  const base = createRouter([{ name: "u", path: "/u/:id" }] as never, {} as never);
  const clone = cloneRouter(base, undefined, opts as never);
  const ctx = getInternals(clone);
  const cs = ctx.getCloneState() as unknown as {
    options: Record<string, unknown>;
  };

  out.B = {
    getCloneState_options_isCallerContainer: (cs.options as unknown) === (opts as unknown),
    getCloneState_options_logger_isCallerContainer:
      cs.options.logger === (opts as unknown),
    getCloneState_options_logger_isCallerLeaf: cs.options.logger === (leaf as unknown),
    getOptions_logger_isCallerLeaf:
      (getPluginApi(clone).getOptions() as unknown as { logger: unknown })
        .logger === (leaf as unknown),
    getCloneState_options_frozen: Object.isFrozen(cs.options),
    callerContainerFrozen_mustBeFalse: Object.isFrozen(opts),
    callerLeafFrozen_mustBeFalse: Object.isFrozen(leaf),
    posControl_built: clone.buildPath("u", { id: "1" }),
  };
  clone.dispose();
  base.dispose();
}

console.log(JSON.stringify(out, null, 1));
