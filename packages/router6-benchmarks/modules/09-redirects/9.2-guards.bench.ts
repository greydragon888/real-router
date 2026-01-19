// packages/real-router-benchmarks/modules/09-redirects/9.2-guards.bench.ts

import { bench } from "mitata";

import { createSimpleRouter } from "../helpers";

// 9.2.1 Redirect from canActivate guard
{
  const router = createSimpleRouter();

  router.canActivate(
    "about",
    (_router) => () => _router.makeState("home", {}, "/"),
  );
  router.start();

  bench("9.2.1 Redirect from canActivate guard", () => {
    router.navigate("about");
  }).gc("inner");
}

// 9.2.2 Redirect from canDeactivate guard
{
  const router = createSimpleRouter();

  router.canDeactivate(
    "about",
    (_router) => () => _router.makeState("home", {}, "/"),
  );
  router.start();
  router.navigate("about");

  bench("9.2.2 Redirect from canDeactivate guard", () => {
    router.navigate("users");
  }).gc("inner");
}

// 9.2.3 Redirect with context preservation
{
  const router = createSimpleRouter();

  router.canActivate(
    "user",

    (_router) => (toState) => {
      if (toState.params.id === "protected") {
        return _router.makeState("home", {}, "/");
      }

      return true;
    },
  );
  router.start();

  bench("9.2.3 Redirect with context preservation", () => {
    router.navigate("user", { id: "protected" });
  }).gc("inner");
}
