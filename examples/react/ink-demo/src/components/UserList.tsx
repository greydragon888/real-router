import { useNavigator, useRouteNode, useRouter } from "@real-router/react/ink";
import { Box, Text, useFocusManager, useInput } from "ink";
import { useState } from "react";

import { USER_IDS, capitalize, isUserId } from "../users";
import { MENU_IDS } from "./Menu";
import { UserCard } from "./UserCard";

import type { UserId } from "../users";
import type { FC } from "react";

const prev = (i: number): number => (i === 0 ? USER_IDS.length - 1 : i - 1);
const next = (i: number): number => (i === USER_IDS.length - 1 ? 0 : i + 1);

const initialIndex = (selectedId: UserId | undefined): number => {
  if (selectedId === undefined) {
    return 0;
  }

  const found = USER_IDS.indexOf(selectedId);

  return found === -1 ? 0 : found;
};

interface UserItemProps {
  id: UserId;
  isHighlighted: boolean;
  isCurrent: boolean;
}

const UserItem: FC<UserItemProps> = ({ id, isHighlighted, isCurrent }) => {
  const textProps: { color?: string; bold?: boolean } = {};

  if (isHighlighted) {
    textProps.color = "cyan";
  } else if (isCurrent) {
    textProps.color = "green";
  }

  if (isCurrent) {
    textProps.bold = true;
  }

  return (
    <Text {...textProps}>
      {isHighlighted ? "❯ " : "  "}
      {capitalize(id)}
    </Text>
  );
};

export const UserList: FC = () => {
  const router = useRouter();
  const navigator = useNavigator();
  const { activeId } = useFocusManager();
  const { route } = useRouteNode("users");
  const rawId = route?.params.id;
  const selectedId = isUserId(rawId) ? rawId : undefined;
  const [idx, setIdx] = useState(() => initialIndex(selectedId));

  useInput((_input, key) => {
    if (key.upArrow) {
      setIdx(prev);

      return;
    }

    if (key.downArrow) {
      setIdx(next);

      return;
    }

    if (key.backspace && selectedId !== undefined) {
      router.back();

      return;
    }

    if (key.return) {
      // Skip Enter when Home/About is focused — their own InkLink handles it.
      if (activeId === MENU_IDS.home || activeId === MENU_IDS.about) {
        return;
      }

      navigator.navigate("users.view", { id: USER_IDS[idx] }).catch(() => {});
    }
  });

  const hint =
    selectedId === undefined
      ? "↑/↓ to highlight, Enter to open."
      : "↑/↓ to highlight, Enter to open, Backspace to go back.";

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Users</Text>
      <Text dimColor>{hint}</Text>
      <Box flexDirection="column" marginTop={1}>
        {USER_IDS.map((id, i) => (
          <UserItem
            key={id}
            id={id}
            isHighlighted={i === idx}
            isCurrent={selectedId === id}
          />
        ))}
      </Box>
      {selectedId !== undefined && <UserCard id={selectedId} />}
    </Box>
  );
};
