import { InkLink } from "@real-router/react/ink";
import { Box } from "ink";

import type { FC } from "react";

export const MENU_IDS = {
  home: "menu-home",
  users: "menu-users",
  about: "menu-about",
} as const;

interface MenuItemProps {
  routeName: string;
  id: string;
  autoFocus?: boolean;
  children: string;
}

const MenuItem: FC<MenuItemProps> = ({
  routeName,
  id,
  autoFocus,
  children,
}) => (
  <InkLink
    routeName={routeName}
    id={id}
    activeColor="green"
    focusColor="cyan"
    autoFocus={autoFocus}
  >
    {children}
  </InkLink>
);

export const Menu: FC = () => (
  <Box marginTop={1} columnGap={2}>
    <MenuItem routeName="home" id={MENU_IDS.home} autoFocus>
      [ Home ]
    </MenuItem>
    <MenuItem routeName="users" id={MENU_IDS.users}>
      [ Users ]
    </MenuItem>
    <MenuItem routeName="about" id={MENU_IDS.about}>
      [ About ]
    </MenuItem>
  </Box>
);
