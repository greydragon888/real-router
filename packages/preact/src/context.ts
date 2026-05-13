import { createContext } from "preact";
import { useContext } from "preact/hooks";

import type { RouteContext as RouteContextType } from "./types";
import type { Router, Navigator } from "@real-router/core";
import type { Context } from "preact";

export const RouteContext = createContext<RouteContextType | null>(null);

export const RouterContext = createContext<Router | null>(null);

export const NavigatorContext = createContext<Navigator | null>(null);

export function createUseContextOrThrow<T>(
  context: Context<T | null>,
  hookName: string,
): () => T {
  return () => {
    const value = useContext(context);

    if (!value) {
      throw new Error(`${hookName} must be used within a RouterProvider`);
    }

    return value;
  };
}
