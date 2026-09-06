// Census-completeness probe: `validateRoute` / `validateRouteType` are PUBLIC
// exports of `@real-router/core/validation`, consumed by validation-plugin on
// the CALLER's route objects. Per-key read counts on a Proxy route show the
// walk the export makes over a caller-owned container (the same class as the
// censused `RouterValidator.dependencies.validateDependenciesObject·deps`).
import { validateRoute } from "@real-router/core/validation";

import { countingProxy } from "../../../../packages/core/tests/helpers/hostileBags";

const child = countingProxy({ name: "child", path: "/child" });
const route = countingProxy({
  name: "top",
  path: "/top",
  encodeParams: (c: unknown) => c,
  decodeParams: (c: unknown) => c,
  children: [child.bag],
});

let threw: string | undefined;

try {
  validateRoute(route.bag as never, "add");
} catch (error) {
  threw = (error as Error).message;
}

// NEGATIVE CONTROL: a refused shape (a getter on the route) stops at the
// descriptor walk — no member read happens after the refusal.
const withGetter = countingProxy({ name: "g", path: "/g" });
const getterRoute = { get name() { return "g"; }, path: "/g" };
let refused: string | undefined;

try {
  validateRoute(getterRoute as never, "add");
} catch (error) {
  refused = (error as Error).message;
}

console.log(
  JSON.stringify(
    {
      validateRoute: { threw, routeReads: route.reads, childReads: child.reads },
      control: { refused, untouchedProxyReads: withGetter.reads },
    },
    null,
    1,
  ),
);
