import { RevalidateButton } from "../client-components/RevalidateButton";
import type { User } from "../db";

export function UserProfile({ user }: { user: User }) {
  return (
    <article data-testid="user-profile" data-user-id={user.id}>
      <h1 data-testid="user-name">{user.name}</h1>
      <p data-testid="user-email">{user.email}</p>
      <RevalidateButton />
    </article>
  );
}
