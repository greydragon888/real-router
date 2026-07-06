---
"@real-router/core": minor
---

Reject a non-ASCII static segment at registration instead of shipping a dead route (#1154)

A raw non-ASCII static segment — `/café`, `/меню`, `/新闻` — registered but could never match: `match` rejects any non-ASCII input byte (its single-pass scanner) and compares static trie keys raw (never percent-decoded), so `buildPath` emitted `/café` — a URL its own `match` rejects. Registration now throws with the workaround (`percent-encode it, e.g. "/caf%C3%A9", or use a param`); the percent-encoded form already works today. A non-ASCII **param name** or **constraint body** (`:id<[а-я]+>`, matched against the *decoded* value) is unaffected — only static text is compared raw. `@real-router/validation-plugin`'s `addRoute` rejects it too, with a route-contextual message.
