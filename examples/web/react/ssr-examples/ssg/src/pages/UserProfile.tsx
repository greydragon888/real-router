import { useRouteNode } from "@real-router/react";

const USERS: Record<string, string> = {
  "1": "Alice",
  "2": "Bob",
  "3": "Charlie",
};

export function UserProfile(): React.JSX.Element {
  const { route } = useRouteNode("users");
  const id = route ? (route.params.id as string) : "";
  const name = USERS[id] ?? "Unknown";

  return (
    <div>
      <h2>User Profile</h2>
      <p>ID: {id}</p>
      <p>Name: {name}</p>
    </div>
  );
}
