---
"@real-router/navigation-plugin": minor
---

The `navigate` handler leaves to the browser what the browser performs itself: a link, redirect or form to a URL with no route, a form POST, a reload and a download (#2724)

**Breaking Change:** the handler took over every navigation it could intercept. It now declines four kinds, and the browser performs them as it does under `@real-router/browser-plugin`, which listens to `popstate` only:

- a navigation that would load a new document (`event.destination.sameDocument` is `false`) to a URL that matches no route — a plain `<a href>`, `location.assign()`, `location.replace()`, `navigation.navigate()` or a GET form. The browser requests the page; the router no longer handles it in place.
- a POST form submission (`event.formData` is set) to any URL — the body reaches the server.
- a download (`event.downloadRequest` is set) from any URL — an `<a download>` downloads.
- a reload (`event.navigationType` is `"reload"`) — `location.reload()` and `navigation.reload()` reload the document. On a URL with a route, `location.reload()` did not reload the document; where that URL showed the router's own state, the router refused it with `SAME_STATES`, which reached `onTransitionError` — `RouterErrorBoundary` and `logger-plugin` included.

A declined navigation:

- consults no `canDeactivate` guard, because the router never sees it — a page the browser leaves is protected by `beforeunload`, as under `browser-plugin`;
- emits no `ROUTE_NOT_FOUND` through `onTransitionError` under `allowNotFound: false`;
- stages no `state.context.navigation` for the router's next transition.

Links and `location.assign()` to a URL with a route stay single-page navigations. A same-document navigation to a URL with no route — `history.pushState()`, Back or Forward to an entry of this document — is still the router's: `navigateToNotFound()` under `allowNotFound: true`, `ROUTE_NOT_FOUND` otherwise.

Starting a download cancels a navigation the router is still taking, with its URL already committed, and keeps the document. The plugin then writes the URL of the route the router stayed on, on the next task, as it does after a refused guard.

**Migration:**

- To keep URLs no route matches inside the application, declare a catch-all route (a splat such as `/*rest`): its URLs match, so the router takes them.
- For a soft reload, call `router.navigate(name, params, search, { reload: true })` rather than `location.reload()`.
- Under `allowNotFound: false`, a server that serves the application for any URL makes such a page start with `router.start()` rejecting `ROUTE_NOT_FOUND`, as a direct visit to that URL already does.
