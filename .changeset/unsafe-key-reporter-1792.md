---
"@real-router/validation-plugin": minor
---

Report a `__proto__` key dropped off a URL's query (#1792)

`__proto__` is the only ACCESSOR among `Object.prototype`'s twelve own members, so
`bag[key] = value` for it reaches the inherited setter and creates no own key.
Core now answers that key by the SOURCE of the data: a bag someone WROTE is
refused, and a bag parsed out of a URL is DROPPED — because a URL is not the
caller's code and `match()` must never throw on input (#737), or a link from
anywhere would crash a popstate handler.

A silent drop is still a loss of information, so this plugin reports it, the same
always-on-fixes / opt-in-diagnoses split the mode gate uses (#1575). Bare core
stays silent; install the plugin and the drop is named:

```
[router] A URL for route "search" carried a "__proto__" key, which was dropped
rather than admitted into the state. … Nothing is wrong with your code: this is
input, and it is reported rather than refused because `match()` must never throw
on a URL. A caller bag carrying the same key IS refused, with a TypeError.
```

Said **once per route + key, per router** — the counter is closed over per
instance rather than shared at module scope (#1583), so two routers in one process
do not silence each other's first report, and a `<Link>` re-rendering over the same
URL does not repeat it.
