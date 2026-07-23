import { database } from "../database";

export interface PageMeta {
  title: string;
  description: string;
}

const DEFAULTS: PageMeta = {
  title: "Real-Router Solid SSR Example",
  description:
    "Server-side rendering with Real-Router and Solid 1.x via Vite + Express.",
};

export function getMetaForState(state: {
  name: string;
  params: Record<string, unknown>;
  search: Record<string, unknown>;
}): PageMeta {
  switch (state.name) {
    case "home": {
      return {
        title: "Home — Real-Router Solid SSR",
        description: "Welcome to the Real-Router Solid SSR example.",
      };
    }
    case "users": {
      const sort = state.search.sort === "desc" ? "desc" : "asc";

      return {
        title: `All Users (sorted ${sort}) — Real-Router Solid SSR`,
        description: `Browse the user list, sorted ${sort}.`,
      };
    }
    case "users.profile": {
      const id = state.params.id as string | undefined;
      const user = id ? database.users.findById(id) : undefined;
      const name = user?.name ?? "Unknown user";

      return {
        title: `${name} — Real-Router Solid SSR`,
        description: `Profile page for ${name} (id: ${id ?? "?"}).`,
      };
    }
    case "users.profile.posts": {
      const id = state.params.id as string | undefined;
      const user = id ? database.users.findById(id) : undefined;
      const name = user?.name ?? "Unknown user";

      return {
        title: `${name}'s posts — Real-Router Solid SSR`,
        description: `Posts authored by ${name}.`,
      };
    }
    case "dashboard": {
      return {
        title: "Dashboard — Real-Router Solid SSR",
        description: "Authenticated dashboard.",
      };
    }
    case "admin": {
      return {
        title: "Admin — Real-Router Solid SSR",
        description: "Admin-only area.",
      };
    }
    case "asyncPage": {
      return {
        title: "Async Page — Real-Router Solid SSR",
        description: "Async-rendered page demonstrating renderToStringAsync.",
      };
    }
    case "form": {
      return {
        title: "Form — Real-Router Solid SSR",
        description: "Form with SSR-safe stable IDs via createUniqueId.",
      };
    }
    default: {
      return DEFAULTS;
    }
  }
}
