---
"@real-router/core": minor
---

Publish the refusal raiser from `@real-router/core/utils` (#2487)

A refusal opens with a bracketed pointer naming the call the caller made, and
that pointer is an address a reader follows into their own code. Written once per
throw it drifts: #2456 and #2459 carried none at all, #2399, #2461 and #2477
named a door that cannot reach the message.

`raiser(receiver, door?)` binds the head once per door and hands back one builder
per constructor — `type`, `plain`, `ref`, `range`, and `code(code, fields?)` for a
`RouterError` frozen for the throw. `type` and `plain` also accept `ErrorOptions`,
because a `cause` the constructor takes is non-enumerable while one assigned
afterwards is not. `internalDefect.plain` writes the unbracketed
`Internal error (please report): …` for a defect no caller input can reach.

The raiser RETURNS the error, so `throw` stays at the site and a site may still
tag what it built before throwing.

No call site is converted here — this is the primitive only.
