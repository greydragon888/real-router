import { database } from "../database";

// Per-route metadata resolved at render time. The render() function
// in entry-server.ts inspects the matched router state, computes the
// PageMeta block, and the express middleware splices it into the
// `<!--ssr-meta-->` placeholder of the dist/client/index.html template.
//
// canonical is intentionally an ABSOLUTE URL — the SITE_ORIGIN env
// var or fallback ("https://example.com") prefixes the path. Search
// engines and social-media crawlers expect canonical to be absolute.
//
// og:title / og:description / og:url enable OpenGraph card previews
// when the page is shared to social platforms.

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
  title: "Real-Router Vue SSR Example",
  description:
    "Server-side rendering with Real-Router and Vue 3 via Vite + Express.",
  canonical: SITE_ORIGIN,
  ogTitle: "Real-Router Vue SSR Example",
  ogDescription:
    "Server-side rendering with Real-Router and Vue 3 via Vite + Express.",
};

export function getMetaForState(state: {
  name: string;
  params: Record<string, unknown>;
  search: Record<string, unknown>;
}): PageMeta {
  switch (state.name) {
    case "home": {
      return {
        title: "Home — Real-Router Vue SSR",
        description: "Welcome to the Real-Router Vue SSR example.",
        canonical: abs("/"),
        ogTitle: "Home",
        ogDescription: "Welcome to the Real-Router Vue SSR example.",
      };
    }
    case "users": {
      const sort = state.search.sort === "desc" ? "desc" : "asc";

      return {
        title: `All Users (sorted ${sort}) — Real-Router Vue SSR`,
        description: `Browse the user list, sorted ${sort}.`,
        canonical: abs("/users"),
        ogTitle: "All Users",
        ogDescription: `Browse the user list, sorted ${sort}.`,
      };
    }
    case "users.profile": {
      const id = state.params.id as string | undefined;
      const user = id ? database.users.findById(id) : undefined;
      const name = user?.name ?? "Unknown user";

      return {
        title: `${name} — Real-Router Vue SSR`,
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
        title: `${name}'s posts — Real-Router Vue SSR`,
        description: `Posts authored by ${name}.`,
        canonical: abs(`/users/${id ?? ""}/posts`),
        ogTitle: `${name}'s posts`,
        ogDescription: `Posts authored by ${name}.`,
      };
    }
    case "dashboard": {
      return {
        title: "Dashboard — Real-Router Vue SSR",
        description: "Authenticated dashboard.",
        canonical: abs("/dashboard"),
        ogTitle: "Dashboard",
        ogDescription: "Authenticated dashboard.",
      };
    }
    case "admin": {
      return {
        title: "Admin — Real-Router Vue SSR",
        description: "Admin-only area.",
        canonical: abs("/admin"),
        ogTitle: "Admin",
        ogDescription: "Admin-only area.",
      };
    }
    default: {
      return DEFAULTS;
    }
  }
}
