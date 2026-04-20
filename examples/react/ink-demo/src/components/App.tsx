import { Box, Text, useApp, useInput } from "ink";

import { Body } from "./Body";
import { Menu } from "./Menu";

import type { FC } from "react";

export const App: FC = () => {
  const { exit } = useApp();

  useInput((input, key) => {
    if (input === "q" || key.escape) {
      exit();
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>real-router + Ink demo</Text>
      <Text dimColor>Tab to move focus, Enter to navigate, q to quit.</Text>
      <Menu />
      <Body />
    </Box>
  );
};
