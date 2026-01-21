// packages/react/modules/context.ts

import { createContext } from "react";

import type { RouteContext as RouteContextType } from "./types";
import type { Router } from "@real-router/core";

export const RouteContext = createContext<RouteContextType | null>(null);

export const RouterContext = createContext<Router | null>(null);
