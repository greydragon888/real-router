import { RouterProvider } from "../RouterProvider";

import type { InkRouterProviderProps } from "../ink-types";
import type { FC } from "react";

export const InkRouterProvider: FC<InkRouterProviderProps> = ({
  router,
  children,
}) => <RouterProvider router={router}>{children}</RouterProvider>;
