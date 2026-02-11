// packages/router-benchmarks/modules/09-redirects/9.2-guards.bench.ts

import { bench } from "mitata";

import { createSimpleRouter } from "../helpers";

// 9.2.1 Redirect from canActivate guard
{
  const router = createSimpleRouter();
  let redirectCount = 0;

  // Redirect to alternating destinations to avoid SAME_STATES
  router.addActivateGuard("about", (_router) => () => {
    const target = redirectCount++ % 2 === 0 ? "home" : "users";

    return _router.makeState(target, {}, target === "home" ? "/" : "/users");
  });
  router.start();

  bench("9.2.1 Redirect from canActivate guard", () => {
    router.navigate("about");
  }).gc("inner");
}

// 9.2.2 Redirect from canDeactivate guard
{
  const router = createSimpleRouter();
  let redirectCount = 0;

  // Redirect to alternating destinations to avoid SAME_STATES
  // Setup guards for both routes so we can alternate
  router.addDeactivateGuard("about", (_router) => () => {
    const target = redirectCount++ % 2 === 0 ? "home" : "users";

    return _router.makeState(target, {}, target === "home" ? "/" : "/users");
  });
  router.addDeactivateGuard(
    "home",
    (_router) => () => _router.makeState("about", {}, "/about"),
  );
  router.addDeactivateGuard(
    "users",
    (_router) => () => _router.makeState("about", {}, "/about"),
  );
  router.start();
  router.navigate("about");

  // Navigate away from current route to trigger canDeactivate
  const routes = ["users", "home"];
  let index = 0;

  bench("9.2.2 Redirect from canDeactivate guard", () => {
    router.navigate(routes[index++ % 2]);
  }).gc("inner");
}

// 9.2.3 Redirect with context preservation
{
  const router = createSimpleRouter();
  let redirectCount = 0;

  // Redirect to alternating destinations to avoid SAME_STATES
  router.addActivateGuard(
    "user",

    (_router) => (toState) => {
      if (toState.params.id === "protected") {
        const target = redirectCount++ % 2 === 0 ? "home" : "about";

        return _router.makeState(
          target,
          {},
          target === "home" ? "/" : "/about",
        );
      }

      return true;
    },
  );
  router.start();

  bench("9.2.3 Redirect with context preservation", () => {
    router.navigate("user", { id: "protected" });
  }).gc("inner");
}
