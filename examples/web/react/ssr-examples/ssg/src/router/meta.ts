import { database } from "../database";

export interface PageMeta {
  title: string;
  description: string;
}

const DEFAULTS: PageMeta = {
  title: "Real-Router — SSG Example",
  description: "Static site generation demo with Real-Router and React 19.",
};

const NOT_FOUND_META: PageMeta = {
  title: "Page Not Found — Real-Router SSG",
  description: "The page you are looking for does not exist.",
};

// Resolve per-route meta tags from the resolved router state. Loaders' data
// is already on state.context.data when this runs, so we can derive titles
// from the actual rendered content (e.g. "User Alice — Profile").
export function getMetaForState(state: {
  name: string;
  params: Record<string, unknown>;
}): PageMeta {
  switch (state.name) {
    case "home":
      return {
        title: "Home — Real-Router SSG",
        description: "Welcome page of the Real-Router SSG demo.",
      };
    case "users":
      return {
        title: "All Users — Real-Router SSG",
        description: "Browse the full list of pre-rendered users.",
      };
    case "users.profile": {
      const id = state.params.id as string | undefined;
      const user = id ? database.users.findById(id) : undefined;
      const name = user?.name ?? "Unknown user";
      return {
        title: `${name} — Real-Router SSG`,
        description: `Profile page for ${name} (id: ${id ?? "?"}).`,
      };
    }
    default:
      return DEFAULTS;
  }
}

export { NOT_FOUND_META };
