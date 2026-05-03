import { describe, it, expect } from "vitest";

import * as reactServerEntry from "../../src/index.react-server";

describe("react-server entry point (src/index.react-server.ts)", () => {
  it("loads without runtime exports (type-only re-exports)", () => {
    const runtimeKeys = Object.keys(reactServerEntry).filter(
      (key) => key !== "default" && key !== "__esModule",
    );

    expect(runtimeKeys).toStrictEqual([]);
  });

  it("does not leak client-only exports (no hooks, no components, no RouterProvider)", () => {
    const moduleAsRecord = reactServerEntry as unknown as Record<
      string,
      unknown
    >;

    const forbiddenExports = [
      "useRouter",
      "useNavigator",
      "useRoute",
      "useRouteNode",
      "useRouteUtils",
      "useRouterTransition",
      "useRouteExit",
      "useRouteEnter",
      "Link",
      "RouteView",
      "RouterErrorBoundary",
      "RouterProvider",
    ];

    for (const exportName of forbiddenExports) {
      expect(
        moduleAsRecord[exportName],
        `${exportName} must NOT be in react-server entry (client-only)`,
      ).toBeUndefined();
    }
  });
});
