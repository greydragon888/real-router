// Navigation-level read-back: does a poisoned registry array change what core
// COMMITS into state.params / state.search?
import { createRouter } from "@real-router/core";
import { getInternals } from "@real-router/core/validation";
import { getPluginApi } from "@real-router/core/api";

const out: Record<string, unknown> = {};

const mk = () =>
  createRouter([{ name: "q", path: "/q/:id?tab" }] as never, {} as never);

const shot = (r: any, label: string) => {
  const api = getPluginApi(r) as any;
  try {
    const s = api.makeState("q", { id: "1" }, { tab: "x" });
    out[label + "_params"] = { ...s.params };
    out[label + "_search"] = { ...s.search };
  } catch (e) {
    out[label] = "throw:" + (e as Error).message;
  }
};

// control arm: untouched registry
shot(mk(), "control");

// poisoned pathNames: "tab" stolen into the path registry
{
  const r = mk();
  const int = getInternals(r) as any;
  (int.port().pathNames("q") as string[]).push("tab");
  shot(r, "pathPoisoned");
  out.pathPoisoned_queryRegistry = [...int.getQueryParams("q")];
}

// poisoned query registry: an undeclared key declared after the fact
{
  const r = mk();
  const int = getInternals(r) as any;
  (int.getQueryParams("q") as string[]).push("nope");
  const api = getPluginApi(r) as any;
  try {
    const s = api.makeState("q", { id: "1" }, { nope: "z" });
    out.queryPoisoned_search = { ...s.search };
  } catch (e) {
    out.queryPoisoned_search = "throw:" + (e as Error).message;
  }
  const r2 = mk();
  const api2 = getPluginApi(r2) as any;
  try {
    const s = api2.makeState("q", { id: "1" }, { nope: "z" });
    out.controlUndeclared_search = { ...s.search };
  } catch (e) {
    out.controlUndeclared_search = "throw:" + (e as Error).message;
  }
}

console.log(JSON.stringify(out, null, 1));
