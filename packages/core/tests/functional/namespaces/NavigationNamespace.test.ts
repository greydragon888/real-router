import { describe, it, expect, vi } from "vitest";

import { errorCodes } from "../../../src/constants";
import { NavigationNamespace } from "../../../src/namespaces/NavigationNamespace/NavigationNamespace";
import { RouterError } from "../../../src/RouterError";

import type {
  NavigationDependencies,
  TransitionDependencies,
} from "../../../src/namespaces/NavigationNamespace/types";
import type { State } from "@real-router/types";

describe("NavigationNamespace - routeTransitionError else branch", () => {
  const makeState = (name: string): State => ({
    name,
    params: {},
    path: `/${name}`,
    meta: { id: 1, params: {}, options: {} },
  });

  it("should call sendTransitionError for unexpected error codes", async () => {
    const ns = new NavigationNamespace();

    const toState = makeState("home");
    const fromState = makeState("index");

    const unexpectedError = new RouterError(errorCodes.ROUTER_NOT_STARTED);

    const sendTransitionError = vi.fn();
    const sendTransitionBlocked = vi.fn();

    const navDeps: NavigationDependencies = {
      getOptions: vi.fn().mockReturnValue({}),
      hasRoute: vi.fn().mockReturnValue(true),
      getState: vi.fn().mockReturnValue(fromState),
      setState: vi.fn(),
      buildStateWithSegments: vi
        .fn()
        .mockReturnValue({ state: toState, meta: {} }),
      makeState: vi.fn().mockReturnValue(toState),
      buildPath: vi.fn().mockReturnValue("/home"),
      areStatesEqual: vi.fn().mockReturnValue(false),
      getDependency: vi.fn(),
      startTransition: vi.fn(),
      cancelNavigation: vi.fn(),
      sendTransitionDone: vi.fn().mockImplementation(() => {
        throw unexpectedError;
      }),
      sendTransitionBlocked,
      sendTransitionError,
      emitTransitionError: vi.fn(),
    };

    const transDeps: TransitionDependencies = {
      getLifecycleFunctions: vi.fn().mockReturnValue([new Map(), new Map()]),
      isActive: vi.fn().mockReturnValue(true),
      isTransitioning: vi.fn().mockReturnValue(false),
      clearCanDeactivate: vi.fn(),
    };

    ns.setCanNavigate(() => true);
    ns.setDependencies(navDeps);
    ns.setTransitionDependencies(transDeps);

    await expect(
      ns.navigateToState(toState, fromState, {}),
    ).rejects.toThrowError();

    expect(sendTransitionError).toHaveBeenCalledWith(
      toState,
      fromState,
      unexpectedError,
    );
    expect(sendTransitionBlocked).not.toHaveBeenCalled();
  });
});
