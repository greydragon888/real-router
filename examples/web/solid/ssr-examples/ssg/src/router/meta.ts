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
  title: "Real-Router — Solid SSG Example",
  description: "Static site generation demo with Real-Router and Solid.",
  canonicalPath: "/",
  ogType: "website",
};

const NOT_FOUND_META: PageMeta = {
  title: "Page Not Found — Real-Router Solid SSG",
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
        title: "Home — Real-Router Solid SSG",
        description: "Welcome page of the Real-Router Solid SSG demo.",
        canonicalPath: "/",
        ogType: "website",
      };
    }
    case "users": {
      return {
        title: "All Users — Real-Router Solid SSG",
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
        title: `${name} — Real-Router Solid SSG`,
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
        title: `${name}'s posts — Real-Router Solid SSG`,
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
