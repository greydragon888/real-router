import { useRouteNode } from "@real-router/react/ink";
import { Box, Text } from "ink";

import { UserList } from "./UserList";

import type { FC } from "react";

const HomePage: FC = () => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold>Home</Text>
    <Text dimColor>Welcome to the Ink demo for real-router.</Text>
  </Box>
);

const AboutPage: FC = () => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold>About</Text>
    <Text dimColor>@real-router/react/ink — subpath for terminal UIs.</Text>
  </Box>
);

export const Body: FC = () => {
  // Root node: fires only on top-level segment change (home/users/about).
  // Intra-subtree navigation (e.g. users → users.view) is handled inside
  // UserList via useRouteNode("users").
  const { route } = useRouteNode("");
  const topSegment = route?.name.split(".")[0];

  switch (topSegment) {
    case "home": {
      return <HomePage />;
    }
    case "users": {
      return <UserList />;
    }
    case "about": {
      return <AboutPage />;
    }
    default: {
      return <Text>Unknown route: {topSegment ?? "—"}</Text>;
    }
  }
};
