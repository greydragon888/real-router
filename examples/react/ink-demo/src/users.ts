export const USER_IDS = ["alice", "bob", "carol"] as const;

export type UserId = (typeof USER_IDS)[number];

export interface UserInfo {
  role: string;
  bio: string;
  email: string;
}

export const USERS: Record<UserId, UserInfo> = {
  alice: {
    role: "Staff Engineer",
    bio: "Works on the router core. Enjoys strongly-typed FSMs and espresso.",
    email: "alice@example.com",
  },
  bob: {
    role: "Designer",
    bio: "Turns wireframes into shipped UI. Vim enthusiast, tabs vs spaces pacifist.",
    email: "bob@example.com",
  },
  carol: {
    role: "Product Manager",
    bio: "Balances scope and timeline. Collects mechanical keyboards.",
    email: "carol@example.com",
  },
};

export const isUserId = (value: unknown): value is UserId =>
  typeof value === "string" && (USER_IDS as readonly string[]).includes(value);

export const capitalize = (value: string): string =>
  value.charAt(0).toUpperCase() + value.slice(1);
