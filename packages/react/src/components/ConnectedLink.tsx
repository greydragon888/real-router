// packages/react/modules/components/ConnectedLink.tsx

import { BaseLink } from "./BaseLink";
import { useRoute } from "../hooks/useRoute";
import { useRouter } from "../hooks/useRouter";

import type { BaseLinkProps } from "./interfaces";
import type { FC } from "react";

export const ConnectedLink: FC<
  Omit<BaseLinkProps, "router" | "route" | "previousRoute">
> = (props) => {
  const router = useRouter();
  const { route } = useRoute();

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { routeOptions, ...linkProps } = props;

  return <BaseLink router={router} route={route} {...linkProps} />;
};
