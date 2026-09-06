import { createRouter } from "@real-router/core";
import { getInternals } from "@real-router/core/validation";
import { cloneRouter, getDependenciesApi } from "@real-router/core/api";

const svc = { tag: "svc" };
const pluginFactory = () => ({});
const cb = () => {};
const routes = [{ name: "home", path: "/" }];
const limitsBag: Record<string, number> = { maxDependencies: 40 };
const router = createRouter(
  routes as never,
  { limits: limitsBag, logger: { level: "warn-error", callback: cb } } as never,
  { svc } as never,
);
router.usePlugin(pluginFactory as never);

const ctx = getInternals(router as never) as never as {
  getCloneState: () => Record<string, any>;
};
const s1 = ctx.getCloneState();
const s2 = ctx.getCloneState();

console.log(
  "A freshPerCall deps/plugins/logger:",
  s1.dependencies !== s2.dependencies,
  s1.pluginFactories !== s2.pluginFactories,
  s1.loggerConfig !== s2.loggerConfig,
);
console.log(
  "A sameRef limits/limitKeys:",
  s1.limits === s2.limits,
  s1.limitKeys === s2.limitKeys,
);
console.log(
  "B frozen limits/limitKeys:",
  Object.isFrozen(s1.limits),
  Object.isFrozen(s1.limitKeys),
);
let threwLimits = "no-throw";
try {
  (s1.limits as any).maxDependencies = 1;
} catch (e) {
  threwLimits = (e as Error).name;
}
let threwKeys = "no-throw";
try {
  (s1.limitKeys as any).push("maxRoutes");
} catch (e) {
  threwKeys = (e as Error).name;
}
console.log("B write to frozen handouts throws:", threwLimits, threwKeys);
console.log(
  "B limits value after attempt:",
  (s1.limits as any).maxDependencies,
  "limitKeys after attempt:",
  JSON.stringify(s1.limitKeys),
);

// C: mutate every handout, then clone and read what the clone actually got
s1.dependencies.injected = "MUTATED";
s1.pluginFactories.push(() => {
  throw new Error("must not run");
});
s1.loggerConfig.level = "none";
s1.loggerConfig.callback = () => {
  throw new Error("must not run");
};

const clone = cloneRouter(router as never, { extra: 1 } as never);
const cloneCtx = getInternals(clone as never) as never as {
  getCloneState: () => Record<string, any>;
};
const cs = cloneCtx.getCloneState();
console.log("C clone deps keys:", JSON.stringify(Object.keys(cs.dependencies)));
console.log(
  "C clone pluginFactories count:",
  cs.pluginFactories.length,
  "base count:",
  ctx.getCloneState().pluginFactories.length,
);
console.log(
  "C clone loggerConfig:",
  cs.loggerConfig.level,
  "callback===cb:",
  cs.loggerConfig.callback === cb,
);
console.log(
  "C clone limits.maxDependencies:",
  cs.limits.maxDependencies,
  "clone limitKeys:",
  JSON.stringify(cs.limitKeys),
);

// positive control: the clone path DOES read the override door
console.log("CTRL override landed (extra):", (cs.dependencies as any).extra);
console.log("CTRL leaf identity svc:", (cs.dependencies as any).svc === svc);

// D: DependenciesApi.getAll
const deps = getDependenciesApi(router as never) as never as {
  getAll: () => Record<string, any>;
  get: (n: string) => unknown;
};
const g1 = deps.getAll();
const g2 = deps.getAll();
console.log("D getAll freshPerCall:", g1 !== g2, "leafByRef:", g1.svc === svc);
g1.svc = "POISON";
(g1 as any).newKey = 1;
console.log(
  "D after poisoning handout: core get(svc)===svc:",
  deps.get("svc") === svc,
  "keys core still reports:",
  JSON.stringify(Object.keys(deps.getAll())),
);
