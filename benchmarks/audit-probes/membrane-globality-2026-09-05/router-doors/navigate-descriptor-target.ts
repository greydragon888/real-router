// Door: Router.navigate · target (NavigationTarget descriptor) + · options.
// Question: is the descriptor CONTAINER copied/held, or read slot-by-slot once and dropped?
// And the options bag: what reaches a plugin — the caller's object or core's copy; is `signal` withheld?
import { createRouter } from "@real-router/core";

import { countingBag } from "../../../../packages/core/tests/helpers/hostileBags";

import type { NavigationOptions } from "@real-router/core/types";

async function main(): Promise<void> {
  const router = createRouter([
    { name: "home", path: "/home" },
    { name: "u", path: "/u/:id?tab" },
  ] as never);

  let receivedOpts: NavigationOptions | undefined;

  router.usePlugin(() => ({
    onTransitionSuccess: (_to, _from, opts) => {
      receivedOpts = opts;
    },
  }));

  await router.start("/home");

  const params = countingBag({ id: "7" });
  const search = countingBag({ tab: "x" });
  const target = countingBag({
    name: "u",
    params: params.bag,
    search: search.bag,
  });
  const signal = new AbortController().signal;
  const opts = countingBag({ replace: true, custom: "kept", signal });

  const state = await router.navigate(target.bag as never, opts.bag as never);

  const afterFirst = {
    targetReads: { ...target.reads },
    paramsReads: { ...params.reads },
    searchReads: { ...search.reads },
    optsReads: { ...opts.reads },
    path: state.path,
    committedParamsIsCallerBag: state.params === params.bag,
    committedSearchIsCallerBag: state.search === search.bag,
    pluginGotCallerOptsObject: receivedOpts === opts.bag,
    pluginOptsFrozen:
      receivedOpts !== undefined && Object.isFrozen(receivedOpts),
    pluginOptsHasSignal:
      receivedOpts !== undefined && Object.hasOwn(receivedOpts, "signal"),
    pluginOptsKeys:
      receivedOpts === undefined ? null : Object.keys(receivedOpts),
    transitionReplace: state.transition.replace,
  };

  // A later, unrelated navigation must not touch the first call's descriptor again.
  await router.navigate("home");

  const afterSecond = {
    targetReadsUnchanged:
      JSON.stringify(target.reads) === JSON.stringify(afterFirst.targetReads),
    optsReadsUnchanged:
      JSON.stringify(opts.reads) === JSON.stringify(afterFirst.optsReads),
  };

  // POSITIVE CONTROL: the positional form with plain bags lands on the same URL.
  const control = await router.navigate("u", { id: "7" }, { tab: "x" });

  router.dispose();

  console.log(
    JSON.stringify(
      { afterFirst, afterSecond, controlPath: control.path },
      null,
      2,
    ),
  );
}

void main();
