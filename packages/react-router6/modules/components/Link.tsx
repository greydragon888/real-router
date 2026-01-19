// packages/react-real-router/modules/components/Link.tsx

import { useRouter } from "react-router6";

import { BaseLink } from "./BaseLink";

import type { BaseLinkProps } from "./interfaces";
import type { FC } from "react";

export const Link: FC<Omit<BaseLinkProps, "router">> = (props) => {
  const router = useRouter();

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { route, previousRoute, routeOptions, ...linkProps } = props;

  return <BaseLink router={router} {...linkProps} />;
};
