import { createContext } from "react";

import type { RouteContext as RouteContextType } from "./types";
import type { Router, Navigator } from "@real-router/core";

// All three contexts use the `<T | null>` shape with a `null` default. Hooks
// (useRouter / useRoute / useNavigator) treat a `null` read as
// "RouterProvider missing" and throw — this surfaces wiring mistakes loudly
// instead of letting consumers chase an undefined router instance.
export const RouteContext = createContext<RouteContextType | null>(null);

export const RouterContext = createContext<Router | null>(null);

export const NavigatorContext = createContext<Navigator | null>(null);
