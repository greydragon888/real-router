// ОПРОВЕРГАТЕЛЬ · закрытие unverified №1 классификатора: P3 ИСПОЛНЕНИЕМ на
// арках A2 (navigateToDefault), A3 (PluginApi.navigateToState),
// A4 (RouterInternals.navigateToState) — там вердикт был ПЕРЕНЕСЁН с A1.
// Каждая секция печатает признак достижения ветки и позитивный контроль.
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import type { NavigationOptions, State } from "@real-router/core/types";

const ROUTES = [
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
  { name: "u", path: "/u/:id?tab" },
] as never;

const mkRouter = () => createRouter(ROUTES, { defaultRoute: "a" });

const out = (s: string, f: Record<string, unknown>): void => {
  console.log(`\n## ${s}`);
  for (const [k, v] of Object.entries(f)) {
    console.log(`  ${k} = ${JSON.stringify(v)}`);
  }
};

function watchHook(r: ReturnType<typeof mkRouter>) {
  let last: unknown;
  let count = 0;
  r.usePlugin((() => ({
    onTransitionSuccess: (_t: State, _f: State | undefined, o: unknown) => {
      last = o;
      count++;
    },
  })) as never);

  return { last: () => last as Record<string, unknown>, count: () => count };
}

const poison = (): NavigationOptions =>
  JSON.parse(
    '{"__proto__":{"pwned":1},"replace":true,"marker":"pp"}',
  ) as NavigationOptions;

async function arc(
  label: string,
  run: (
    r: ReturnType<typeof mkRouter>,
    opts: NavigationOptions,
  ) => Promise<State>,
): Promise<void> {
  const r = mkRouter();
  const h = watchHook(r);
  await r.start("/b");
  let setterHits = 0;
  let threw: string | undefined;
  let hook1: Record<string, unknown> = {};
  let reached1 = "";
  Object.defineProperty(Object.prototype, "marker", {
    configurable: true,
    get(): unknown {
      return undefined;
    },
    set(): void {
      setterHits++;
    },
  });
  try {
    const st = await run(r, {
      marker: "via-define",
      replace: true,
    } as NavigationOptions);
    reached1 = st.name;
    hook1 = h.last();
  } catch (e) {
    threw = String(e);
  } finally {
    delete (Object.prototype as Record<string, unknown>).marker;
  }

  // уводим состояние в сторону, иначе второй вызов той же арки = SAME_STATES
  await r.navigate("b");
  const st2 = await run(r, poison());
  const hook2 = h.last();
  out(`${label} · P3`, {
    reachedBranch_1: reached1,
    hookFired: h.count(),
    P3_inheritedSetterHits: setterHits,
    P3_threw: threw,
    P3_ownMarkerOnCopy: Object.hasOwn(hook1, "marker"),
    P3_markerValue: hook1.marker,
    reachedBranch_2: st2.name,
    P3_protoKeyCarried: Object.hasOwn(hook2, "__proto__"),
    P3_prototypeSwapped: Object.getPrototypeOf(hook2) !== Object.prototype,
    P3_globalPwned: ({} as Record<string, unknown>).pwned !== undefined,
    positiveControl_markerLanded: hook2.marker,
    positiveControl_hookIsNotCallerBag: Object.isFrozen(hook2),
  });
  r.stop();
}

async function main(): Promise<void> {
  await arc("A2 · navigateToDefault·options", (r, o) => r.navigateToDefault(o));
  await arc("A3 · PluginApi.navigateToState·options", (r, o) => {
    const api = getPluginApi(r);

    return api.navigateToState(
      api.makeState("u", { id: "9" }, { tab: "t" }, "/u/9?tab=t"),
      o,
    );
  });
  await arc("A4 · RouterInternals.navigateToState·options", (r, o) => {
    const ctx = getInternals(r);

    return ctx.navigateToState(
      ctx.makeState("u", { id: "7" }, { tab: "q" }, "/u/7?tab=q"),
      o,
    );
  });
}

void main();
