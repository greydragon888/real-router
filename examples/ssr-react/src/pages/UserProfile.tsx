import { useRouteNode } from "@real-router/react";

export function UserProfile(): React.JSX.Element {
  const { route } = useRouteNode("users");

  return (
    <div>
      <h2>User Profile</h2>
      <p>User ID: {route ? (route.params.id as string) : ""}</p>
    </div>
  );
}
