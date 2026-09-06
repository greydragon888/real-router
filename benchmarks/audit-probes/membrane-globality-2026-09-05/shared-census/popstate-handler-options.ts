// L7-shared · popstate-handler: {...deps.transitionOptions, ...resolveHashOptions()} →
// api.navigateToState(matched, options) → adoptNavigationOptions (копия, freeze) → хуки плагинов;
// плюс round-trip `matched` (State от makeState) → #copyChannels → коммит.
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { createPopstateHandler } from "../../../../shared/browser-env/popstate-handler";
import { countingBag } from "../../../../packages/core/tests/helpers/hostileBags";

import type { Browser } from "../../../../shared/browser-env/types";
import type { NavigationOptions, State } from "@real-router/core";

async function main(): Promise<void> {
  const router = createRouter(
    [
      { name: "home", path: "/" },
      { name: "u", path: "/u/:id?tab" },
    ] as never,
    {} as never,
  );

  let seenOpts: NavigationOptions | undefined;
  let seenToState: State | undefined;

  router.usePlugin(() => ({
    onTransitionSuccess: (toState, _from, opts) => {
      seenToState = toState;
      seenOpts = opts;
    },
  }));

  await router.start("/");

  const api = getPluginApi(router);
  const transitionOptions = countingBag({
    source: "popstate",
    replace: true as const,
    forceDeactivate: false,
  });
  const writes: unknown[] = [];
  const browser: Browser = {
    getLocation: () => "/u/7?tab=x",
    getHash: () => "",
    getState: () => undefined,
    pushState: (state) => {
      writes.push(["push", state]);
    },
    replaceState: (state) => {
      writes.push(["replace", state]);
    },
    addPopstateListener: () => () => {},
    addHashChangeListener: () => () => {},
  };

  const handler = createPopstateHandler({
    router,
    api,
    browser,
    allowNotFound: false,
    transitionOptions: transitionOptions.bag,
    loggerContext: "probe",
    buildUrl: (name, params, search) => router.buildPath(name, params, search),
    getCurrentHash: () => "frag",
    getCurrentContextHash: () => "",
  });

  const entryParams = { id: "7" };
  const entry = {
    name: "u",
    params: entryParams,
    search: { tab: "x" },
    path: "/u/7?tab=x",
  };
  const settled = new Promise<void>((resolve) => {
    const off = router.subscribe(() => {
      off();
      resolve();
    });
  });

  handler({ state: entry } as PopStateEvent);
  await settled;

  const committed = router.getState();

  console.log(
    "A",
    JSON.stringify({
      transitionOptionsReads: transitionOptions.reads,
      optsIsPluginObject: seenOpts === transitionOptions.bag,
      optsFrozen: Object.isFrozen(seenOpts),
      opts: seenOpts,
      committedName: committed?.name,
      committedParamsIsEntryParams: committed?.params === entryParams,
      committedParamsFrozen: Object.isFrozen(committed?.params),
      transitionReplace: committed?.transition.replace,
      hookToStateIsGetState: seenToState === committed,
    }),
  );
}

main().catch((error: unknown) => {
  console.error("PROBE FAILED", error);
  process.exitCode = 1;
});
