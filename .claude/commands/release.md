Опубликуй релиз пакетов через changesets и npm OIDC Trusted Publishing, либо разбери проблему публикации: проверь состояние workflow, определи, нужен ли ручной первый publish, и не предлагай токен там, где нужен браузерный обряд.

Входные данные:
$ARGUMENTS

Формат аргументов (всё необязательно): имя пакета, номер прогона workflow, или свободное описание симптома.

## Канон

- **Only workflow:** `changesets.yml` — publishing via npm OIDC Trusted Publishing. There is no `release.yml`; an "emergency release" is a re-run of this workflow (`changeset publish` is idempotent — already-published versions are skipped, and the reconcile step backfills tags/Releases)
- Trusted Publisher configured for all @real-router/\* packages with workflow `changesets.yml`. The release job **must stay on a GitHub-hosted runner** — npm trusted publishing does not support self-hosted ones, and moving it would fail only at publish time, on master. Guarded by `scripts/release-workflow.test.mjs`
- **Publishing is tokenless.** No `NPM_TOKEN` anywhere; every version is published by `trustedPublisher: github` with SLSA provenance. Never "fix" a publish problem by minting an npm token — least of all a 2FA-bypass granular token, the credential class npm is winding down (it loses direct publishing around Jan 2027)

### Adding a new package to npm (one-time, human-only)

A trusted publisher can only be attached to a package that **already exists** on the registry ([npm/cli#8544](https://github.com/npm/cli/issues/8544)), so the first publish is manual — and it **cannot be scripted or delegated to CI/an agent**. The account's 2FA is `auth-and-writes` with a WebAuthn security key as the only second factor, so any write action needs a browser ceremony; run headlessly, npm just dies with `EOTP` (there is no TOTP fallback — npm stopped accepting new TOTP enrollments in Sept 2025).

```bash
npm login --auth-type=web          # opens the browser → "Use security key"
pnpm publish --filter <pkg>        # the one-time first publish
npm trust github <pkg> --file changesets.yml \
  --repo greydragon888/real-router --allow-publish
```

`--allow-publish` is **not optional**: trusted-publisher configurations created after 2026-05-20 must name at least one allowed action (older ones, i.e. the existing 23 packages, default to publish-only). Same applies to `npm deprecate` on a retired package — a write action, same ceremony.

If the manual step is skipped, the release run says so: the preflight (`.changeset/unpublished-packages.mjs`) distinguishes "never published" from "one release behind" and emits an `::error::` naming exactly this procedure, instead of letting `changeset publish` die on a bare 404.

## Гейты

- Публикация — исходящее действие: НЕ запускай workflow и НЕ публикуй без явной просьбы пользователя.
- Ручной первый `npm publish` и `npm trust` **нельзя делегировать** — они требуют браузерного обряда с ключом безопасности. Скажи пользователю, что делать, и остановись.
- Никогда не предлагай минтить npm-токен в обход OIDC.
