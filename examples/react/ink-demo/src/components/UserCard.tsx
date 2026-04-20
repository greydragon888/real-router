import { Box, Text } from "ink";

import { USERS, capitalize } from "../users";

import type { UserId } from "../users";
import type { FC } from "react";

export const UserCard: FC<{ id: UserId }> = ({ id }) => {
  const { role, email, bio } = USERS[id];

  return (
    <Box
      flexDirection="column"
      marginTop={1}
      paddingX={1}
      borderStyle="round"
      borderColor="green"
    >
      <Text bold color="green">
        {capitalize(id)}
      </Text>
      <Text>
        <Text dimColor>Role: </Text>
        {role}
      </Text>
      <Text>
        <Text dimColor>Email: </Text>
        {email}
      </Text>
      <Box marginTop={1}>
        <Text>{bio}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Backspace — back to the list.</Text>
      </Box>
    </Box>
  );
};
