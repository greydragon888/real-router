---
"@real-router/sources": patch
---

Fix: `createActiveNameSelector` stale-generation unsubscribe no longer orphans a live subscriber (#1206), + selector listener-isolation property (#1208 §4.3)

Duplicate `(name, callback)` subscriptions produce N unsubscribe closures over a single deduped `Set`. After that generation is fully torn down and a later `subscribe` re-creates the name (a fresh `Set`), a stale closure's teardown deleted the LIVE generation's map entry — the empty stale `Set` tripped `size === 0`, so `listenersByName.delete(name)` removed the new `Set` and `disconnect()` dropped the shared router subscription, leaving the live subscriber permanently deaf. The unsubscribe closure now bails when `listenersByName.get(name)` is no longer the `Set` it captured (identity, not truthiness).

Also closes the #1208 §4.3 property gap: the selector's per-listener exception isolation (#767) was killed only by a unit test and survived the entire property suite. Added a property that fails when the `try/catch` is removed, plus the `#1206` no-orphan property and two new INVARIANTS rows.
