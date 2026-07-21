import { useEffect, useMemo, useRef } from "react";

import { Match, NotFound, Self } from "./components";
import { buildRenderList, collectElements } from "./helpers";
import { useRouteNode } from "../../../hooks/useRouteNode";

import type { RouteViewProps } from "./types";
import type { ReactElement } from "react";

function RouteViewRoot({
  nodeName,
  children,
}: Readonly<RouteViewProps>): ReactElement | null {
  const { route } = useRouteNode(nodeName);
  const hasBeenActivatedRef = useRef<Set<string> | null>(null);

  // eslint-disable-next-line @eslint-react/refs -- lazy init: assign once when null to avoid `new Set()` allocation on every render
  hasBeenActivatedRef.current ??= new Set();
  // eslint-disable-next-line @eslint-react/refs -- stable render cache; the ref is never reassigned after lazy init
  const hasBeenActivated = hasBeenActivatedRef.current;

  // Skip the Children.forEach + collectElements traversal when the children
  // reference is unchanged. The common SPA case is a stable JSX tree across
  // re-renders, so the cache hits on every render except the first.
  //
  // Streaming SSR caveat: with `renderToReadableStream`, React may invoke
  // RouteView multiple times across chunks with a fresh `children` reference
  // each time. The useMemo misses on each new render and the traversal runs
  // again — this is the expected SSR cost; the alternative would be build-
  // time codegen of the static route tree, which is out of scope here.
  const elements = useMemo(() => {
    const collected: ReactElement[] = [];

    collectElements(children, collected);

    return collected;
  }, [children]);

  const routeName = route?.name ?? null;

  // Memoize the render walk by its pure inputs. Previously `buildRenderList` ran
  // on EVERY render because `processMatch` mutated the keepAlive Set inline —
  // coupling the pure winner/`rendered` computation to a side effect, so a
  // parent re-render with no route change re-walked every Match and re-diffed
  // the identical output (preact, whose `buildRenderList` is a 3-arg pure
  // function, already memoizes here). The Set mutation now lives in the effect
  // below, so the walk memoizes on `[elements, routeName, nodeName]` too. #1251.
  const { rendered, activatedName } = useMemo(() => {
    if (routeName === null) {
      return { rendered: [] as ReactElement[], activatedName: null };
    }

    const result = buildRenderList(
      elements,
      routeName,
      nodeName,
      hasBeenActivated,
    );

    return { rendered: result.rendered, activatedName: result.activatedName };
  }, [elements, routeName, nodeName, hasBeenActivated]);

  // Commit the keepAlive activation AFTER render, not during it. A render that
  // React discards under concurrent rendering must not record an activation
  // that never committed — otherwise a later render would show that
  // never-mounted match as a hidden keepAlive subtree. Adding the same name
  // twice is a no-op, so the effect is safe to re-run.
  // `hasBeenActivated` is a ref-held Set (L15-20), mutated post-commit in this
  // effect — the concurrent-safe pattern #1251 established. @eslint-react's
  // experimental `immutability` rule (detection widened in v5.17) flags the ref
  // mutation and suggests state, which would defeat the ref's whole purpose
  // (re-render-free activation tracking). Intentional exception, scoped here.
  /* eslint-disable @eslint-react/immutability -- intentional post-commit ref-Set mutation, see #1251 */
  useEffect(() => {
    if (activatedName !== null) {
      hasBeenActivated.add(activatedName);
    }
  }, [activatedName, hasBeenActivated]);
  /* eslint-enable @eslint-react/immutability */

  if (rendered.length > 0) {
    return <>{rendered}</>;
  }

  return null;
}

RouteViewRoot.displayName = "RouteView";

export const RouteView = Object.assign(RouteViewRoot, {
  Match,
  Self,
  NotFound,
});

export type {
  RouteViewProps,
  MatchProps as RouteViewMatchProps,
  SelfProps as RouteViewSelfProps,
  NotFoundProps as RouteViewNotFoundProps,
} from "./types";
