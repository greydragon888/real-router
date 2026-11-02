---
"@real-router/preact": patch
---

`createDirectionTracker` labels the navigation after a URL plugin's return `forward` (#2879)

A URL plugin now holds the write of a navigation that commits while the plugin's return travels, so that return's `popstate` finds another address than the router's and arms the tracker's flag, with no transition behind it. The tracker spends such a flag when the next transition starts at the router's address: `<html data-nav-direction>` reads `forward` there, not `back`. A flag a transition's end passes on is left alone, so a Back replayed after another keeps `back`. Upgrade together with the URL plugin.
