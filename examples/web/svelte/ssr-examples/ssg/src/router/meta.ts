import { database } from "../database";

export interface PageMeta {
  title: string;
  description: string;
  /** Path-only canonical (e.g. `/users/1`). The build script joins it with SITE_ORIGIN. */
  canonicalPath: string;
  /** og:type — defaults to "website"; profile pages use "profile". */
  ogType: "website" | "profile" | "article";
  /** Optional og:image absolute URL. Falls back to a SITE_ORIGIN-prefixed default. */
  ogImagePath?: string;
}

const DEFAULTS: PageMeta = {
  title: "Real-Router — Svelte SSG Example",
  description: "Static site generation demo with Real-Router and Svelte 5.",
  canonicalPath: "/",
  ogType: "website",
};

const NOT_FOUND_META: PageMeta = {
  title: "Page Not Found — Real-Router Svelte SSG",
  description: "The page you are looking for does not exist.",
  canonicalPath: "/404",
  ogType: "website",
};

export function getMetaForState(state: {
  name: string;
  params: Record<string, unknown>;
}): PageMeta {
  switch (state.name) {
    case "home": {
      return {
        title: "Home — Real-Router Svelte SSG",
        description: "Welcome page of the Real-Router Svelte SSG demo.",
        canonicalPath: "/",
        ogType: "website",
      };
    }
    case "users": {
      return {
        title: "All Users — Real-Router Svelte SSG",
        description: "Browse the full list of pre-rendered users.",
        canonicalPath: "/users",
        ogType: "website",
      };
    }
    case "users.profile": {
      const id = state.params.id as string | undefined;
      const user = id ? database.users.findById(id) : undefined;
      const name = user?.name ?? "Unknown user";

      return {
        title: `${name} — Real-Router Svelte SSG`,
        description: `Profile page for ${name} (id: ${id ?? "?"}).`,
        canonicalPath: `/users/${id ?? ""}`,
        ogType: "profile",
        ogImagePath: `/og/users/${id ?? "default"}.png`,
      };
    }
    case "users.profile.posts": {
      const id = state.params.id as string | undefined;
      const user = id ? database.users.findById(id) : undefined;
      const name = user?.name ?? "Unknown user";

      return {
        title: `${name}'s posts — Real-Router Svelte SSG`,
        description: `Posts authored by ${name} (id: ${id ?? "?"}).`,
        canonicalPath: `/users/${id ?? ""}/posts`,
        ogType: "article",
        ogImagePath: `/og/users/${id ?? "default"}-posts.png`,
      };
    }
    default: {
      return DEFAULTS;
    }
  }
}

export { NOT_FOUND_META };
