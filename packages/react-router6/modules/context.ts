// packages/react-router6/modules/context.ts

import { createContext } from "react";

import type { RouteContext as RouteContextType } from "./types";
import type { Router } from "router6";

export const RouteContext = createContext<RouteContextType | null>(null);

export const RouterContext = createContext<Router | null>(null);
