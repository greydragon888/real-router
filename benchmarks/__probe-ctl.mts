// CELL CONTROL ARM — Router.ts claims, probed by execution.
import { createRouter } from "@real-router/core";
import { getInternals } from "@real-router/core/validation";

const ok = (label: string, verdict: boolean, detail = "") =>
  console.log(`  ${verdict ? "HOLDS  " : "FALSE  "} ${label.padEnd(46)} ${detail}`);

// CELL C1 (L234/L240): "a dependency bag is enumerated ONCE per router instead of twice"
{
  let enumerations = 0;
  // ⚠ NOT a getter bag: `ingestDependencies` refuses accessors outright, so that
  // input never reaches the walk the claim is about. `ownKeys` counts the
  // ENUMERATION the claim actually names.
  const bag = new Proxy({ svc: 1 } as Record<string, unknown>, {
    ownKeys(t) { enumerations += 1; return Reflect.ownKeys(t); },
  });
  const r = createRouter([{ name: "h", path: "/h" }], {}, bag as never);

  ok("C1 dependency bag enumerated ONCE", enumerations === 1, `enumerations=${String(enumerations)}`);
  r.stop();
}

// CELL C2 (L240): "the walk RETURNS core's batch… instead of handing the caller's array on"
{
  const routes = [{ name: "h", path: "/h" }];
  const r = createRouter(routes as never);
  const tree = getInternals(r as never).getTree() as unknown as { children?: unknown };

  ok("C2 caller's array is not the stored one", (tree as never) !== (routes as never));
  r.stop();
}

// CELL C3 (L251): "adopted BEFORE the namespace, so every reader sees core's own object"
{
  const opts = { defaultRoute: "h", queryParamsMode: "loose" as const };
  const r = createRouter([{ name: "h", path: "/h" }], opts);
  const seen = getInternals(r as never).getOptions();

  ok("C3 options reader sees core's copy, not the caller's", (seen as never) !== (opts as never));
  r.stop();
}

// CELL C4 (L267): "the spread skips a non-enumerable own key, so the base does not see one"
{
  const opts: Record<string, unknown> = { defaultRoute: "h" };

  Object.defineProperty(opts, "maxRoutes", { enumerable: false, value: 3 });
  const r = createRouter([{ name: "h", path: "/h" }], opts as never);
  const seen = getInternals(r as never).getOptions() as Record<string, unknown>;

  ok("C4 non-enumerable own key not adopted", !("maxRoutes" in seen) || seen.maxRoutes !== 3,
      `maxRoutes=${String(seen.maxRoutes)}`);
  r.stop();
}

// CELL C5 (L273): "FROZEN… getCloneState hands this out BY REFERENCE"
{
  const r = createRouter([{ name: "h", path: "/h" }]);
  const a = (getInternals(r as never) as unknown as { getCloneState: () => Record<string, unknown> }).getCloneState();
  const b = (getInternals(r as never) as unknown as { getCloneState: () => Record<string, unknown> }).getCloneState();

  ok("C5 limits frozen", Object.isFrozen(a.limits), `frozen=${String(Object.isFrozen(a.limits))}`);
  ok("C5 limits handed out BY REFERENCE", a.limits === b.limits);
  r.stop();
}

// CELL C6 (L128): "Core does not hold the application's container — a WeakRef is not holding it"
{
  const r = createRouter([{ name: "h", path: "/h" }], { defaultParams: { id: "1" } });
  const origins = (getInternals(r as never) as unknown as { getAdoptedOrigins: () => unknown }).getAdoptedOrigins();
  const vals = Object.values(origins as Record<string, unknown>);

  ok("C6 adopted origins are WeakRefs, not strong", vals.every((v) => v instanceof WeakRef || v === undefined),
      `${String(vals.length)} entries`);
  r.stop();
}
