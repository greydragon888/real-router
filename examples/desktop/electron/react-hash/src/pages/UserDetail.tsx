import { Link, useRoute } from "@real-router/react";

import type { JSX } from "react";

export function UserDetail(): JSX.Element {
  const { route } = useRoute<{ id: string }>();
  const id = route?.params.id ?? "?";

  return (
    <section>
      <h1>User</h1>
      <p>User ID: {id}</p>
      <p>
        <Link routeName="users.user.edit" routeParams={{ id }}>
          Edit
        </Link>
        {" · "}
        <Link routeName="users">Back to list</Link>
      </p>
    </section>
  );
}
