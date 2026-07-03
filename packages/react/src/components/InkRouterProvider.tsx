import { RouterProviderCore } from "../RouterProviderCore";

import type { InkRouterProviderProps } from "../ink-types";
import type { FC } from "react";

// Composes the DOM-free RouterProviderCore (not the full RouterProvider) so the
// terminal /ink chunk never pulls in the scroll-spy / view-transitions /
// announcer / scroll-restore factories — none can run without a DOM (#800).
export const InkRouterProvider: FC<InkRouterProviderProps> = ({
  router,
  children,
}) => <RouterProviderCore router={router}>{children}</RouterProviderCore>;
