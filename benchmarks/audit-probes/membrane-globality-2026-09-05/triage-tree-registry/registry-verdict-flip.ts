// Does a push into the handed-out registry array FLIP a core verdict?
// Discriminating input: a key core must classify (params vs search).
import { createRouter } from "@real-router/core";
import { getInternals } from "@real-router/core/validation";

const out: Record<string, unknown> = {};

const mk = () =>
  createRouter([{ name: "q", path: "/q/:id?tab" }] as never, {} as never);

const probe = (r: any, label: string) => {
  // (1) a key placed in the PATH bag that the registry may call a query key
  try {
    out[label + "_paramsWithNope"] = r.buildPath("q", { id: "1", nope: "x" });
  } catch (e) {
    out[label + "_paramsWithNope"] = "throw:" + (e as Error).message;
  }
  // (2) the same key in the SEARCH bag
  try {
    out[label + "_searchWithNope"] = r.buildPath(
      "q",
      { id: "1" },
      { nope: "x" },
    );
  } catch (e) {
    out[label + "_searchWithNope"] = "throw:" + (e as Error).message;
  }
  // (3) the declared query key — positive control that the registry is consulted
  try {
    out[label + "_declaredTab"] = r.buildPath("q", { id: "1" }, { tab: "x" });
  } catch (e) {
    out[label + "_declaredTab"] = "throw:" + (e as Error).message;
  }
};

{
  const r = mk();
  const int = getInternals(r) as any;
  const arr = int.getQueryParams("q") as string[];
  out.baseline_registry = [...arr];
  probe(r, "before");

  arr.push("nope"); // caller writes into core's cached registry through the handout
  out.after_registry = [...int.getQueryParams("q")];
  probe(r, "after");
}

// Control arm: a router whose registry is untouched must keep the BEFORE answers.
{
  const r = mk();
  probe(r, "control");
}

// Same question through the matcher's own (upstream) array.
{
  const r = mk();
  const int = getInternals(r) as any;
  const declared = int
    .routeGetStore()
    .matcher.getDeclaredQueryParams("q") as string[];
  out.matcher_declared_before = [...declared];
  declared.push("zzz");
  out.matcher_declared_after = [...declared];
  out.matcher_push_propagatesToRegistry = [...int.getQueryParams("q")];
  try {
    out.matcher_after_buildPath_zzzInSearch = r.buildPath(
      "q",
      { id: "1" },
      { zzz: "1" },
    );
  } catch (e) {
    out.matcher_after_buildPath_zzzInSearch = "throw:" + (e as Error).message;
  }
}

// pathNames array: same question on the path side.
{
  const r = mk();
  const int = getInternals(r) as any;
  const path = int.port().pathNames("q") as string[];
  out.pathNames_before = [...path];
  out.pathNames_sameAcrossCalls = path === int.port().pathNames("q");
  path.push("tab"); // steal the declared query key into the path registry
  out.pathNames_after = [...int.port().pathNames("q")];
  out.queryRegistry_afterPathPoison = [...int.getQueryParams("q")];
}

console.log(JSON.stringify(out, null, 1));
