import { RevalidateButton } from "../client-components/RevalidateButton";

import type { User } from "../database";
import type { ReactElement } from "react";

export function UserProfile({ user }: Readonly<{ user: User }>): ReactElement {
  return (
    <article data-testid="user-profile" data-user-id={user.id}>
      <h1 data-testid="user-name">{user.name}</h1>
      <p data-testid="user-email">{user.email}</p>
      <RevalidateButton />
    </article>
  );
}
