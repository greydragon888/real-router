import { database } from "../database";

export interface PageMeta {
  title: string;
  description: string;
  /** Absolute canonical URL (not relative path). */
  canonical: string;
  /** OpenGraph title — usually mirrors title without the site suffix. */
  ogTitle: string;
  /** OpenGraph description — usually mirrors description. */
  ogDescription: string;
}

const SITE_ORIGIN =
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  process.env.SITE_ORIGIN ?? "https://example.com";

function abs(path: string): string {
  return `${SITE_ORIGIN}${path}`;
}

const DEFAULTS: PageMeta = {
  title: "Real-Router — Preact SSG Example",
  description: "Static site generation demo with Real-Router and Preact 10.",
  canonical: SITE_ORIGIN,
  ogTitle: "Real-Router Preact SSG Example",
  ogDescription: "Static site generation demo with Real-Router and Preact 10.",
};

export const NOT_FOUND_META: PageMeta = {
  title: "Page Not Found — Real-Router Preact SSG",
  description: "The page you are looking for does not exist.",
  canonical: abs("/404"),
  ogTitle: "Page Not Found",
  ogDescription: "The page you are looking for does not exist.",
};

export function getMetaForState(state: {
  name: string;
  params: Record<string, unknown>;
}): PageMeta {
  switch (state.name) {
    case "home": {
      return {
        title: "Home — Real-Router Preact SSG",
        description: "Welcome page of the Real-Router Preact SSG demo.",
        canonical: abs("/"),
        ogTitle: "Home",
        ogDescription: "Welcome page of the Real-Router Preact SSG demo.",
      };
    }
    case "users": {
      return {
        title: "All Users — Real-Router Preact SSG",
        description: "Browse the full list of pre-rendered users.",
        canonical: abs("/users"),
        ogTitle: "All Users",
        ogDescription: "Browse the full list of pre-rendered users.",
      };
    }
    case "users.profile": {
      const id = state.params.id as string | undefined;
      const user = id ? database.users.findById(id) : undefined;
      const name = user?.name ?? "Unknown user";

      return {
        title: `${name} — Real-Router Preact SSG`,
        description: `Profile page for ${name} (id: ${id ?? "?"}).`,
        canonical: abs(`/users/${id ?? ""}`),
        ogTitle: name,
        ogDescription: `Profile page for ${name}.`,
      };
    }
    case "users.profile.posts": {
      const id = state.params.id as string | undefined;
      const user = id ? database.users.findById(id) : undefined;
      const name = user?.name ?? "Unknown user";

      return {
        title: `${name}'s posts — Real-Router Preact SSG`,
        description: `Posts authored by ${name}.`,
        canonical: abs(`/users/${id ?? ""}/posts`),
        ogTitle: `${name}'s posts`,
        ogDescription: `Posts authored by ${name}.`,
      };
    }
    default: {
      return DEFAULTS;
    }
  }
}
