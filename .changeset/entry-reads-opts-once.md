---
"@real-router/core": patch
---

Every read of the caller's `opts` happens at the navigation's entry (#1719)

`opts` is accessor- or Proxy-backed by contract, so each read is a call into
application code — and there is one window where such a call is dangerous: after
the previous navigation's cancel and before this one's announce. A getter
starting a nested navigation there parks the machine back inside the band, and
the navigation's own `send(NAVIGATE)` then takes a self-loop the table documents
as never traversed.

The prologue kept its reads above that window and a twenty-line comment
explained why. Measured: moving them one statement down leaves the whole tier
green (4088 of 4088), so the comment was the only thing holding the position.

The reads now happen at `executeNavigation`'s entry — before anything is
cancelled or announced — and every consumer takes them as parameters, so
`beginTransition` reads no `opts` field at all. Restoring a read there is not a
matter of moving a line any more. `entry-reads-opts-once.test.ts` scans for it
and keeps the site list closed; it is validated in both directions.

No behaviour change: the reads keep their order relative to
`forceReplaceFromUnknown` (which substitutes the object) and the pre-checks.
Measured on `navigate/sync-baseline`: −0.44 % against an A/A floor of −0.20 %.
