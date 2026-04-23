import { Link, useRoute } from "@real-router/react";

import type { JSX } from "react";

export function UserEdit(): JSX.Element {
  const { route } = useRoute<{ id: string }>();
  const id = route?.params.id ?? "";

  return (
    <section>
      <h1>Edit user</h1>
      <label>
        ID (read-only):
        <input readOnly defaultValue={id} />
      </label>
      <p>
        <Link routeName="users.user" routeParams={{ id }}>
          Cancel
        </Link>
      </p>
    </section>
  );
}
